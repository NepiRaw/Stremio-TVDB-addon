const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

const MARKERS = {
    ok: '✅',
    empty: '📭',
    cache: '💾',
    running: '⏳',
    aborted: '🟠',
    warn: '🔺',
    error: '❌',
    none: '  '
};

const LEVEL_LABEL = { error: 'ERROR', warn: 'WARN ', info: 'INFO ', debug: 'DEBUG', trace: 'TRACE' };
const CATEGORY_WIDTH = 9;
const DURATION_WIDTH = 7;
const ID_WIDTH = 7;

const SLOW_MS = 1000;
const VERY_SLOW_MS = 2500;
const WATCHDOG_MS = Number(process.env.LOG_WATCHDOG_MS) || 2000;

const ANSI = { dim: 90, red: 31, green: 32, yellow: 33, blue: 34, cyan: 36 };
const colourEnabled = Boolean(process.stdout.isTTY);
const paint = (colour, text) => colourEnabled ? `\x1b[${ANSI[colour]}m${text}\x1b[0m` : text;

const store = new AsyncLocalStorage();

let booting = true;

const SECRETS = ['TVDB_API_KEY', 'OMDB_API_KEY', 'ADMIN_API_KEY']
    .map(name => process.env[name])
    .filter(value => typeof value === 'string' && value.length >= 8);

const MONGO_CREDENTIALS = /(mongodb(?:\+srv)?:\/\/)[^:@/\s]+:[^@/\s]+@/gi;

function redact(text) {
    let safe = text.replace(MONGO_CREDENTIALS, '$1[hidden]:[hidden]@');
    for (const secret of SECRETS) {
        safe = safe.split(secret).join('[hidden]');
    }
    return safe;
}

function timestamp() {
    const now = new Date();
    const pad = (value, width = 2) => String(value).padStart(width, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function durationColour(ms, marker) {
    if (marker === 'error' || marker === 'aborted' || ms >= VERY_SLOW_MS) return 'red';
    if (ms >= SLOW_MS) return 'yellow';
    return 'green';
}

function levelColour(level) {
    return level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'dim';
}

function stringify(args) {
    return args.map(arg => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'object' && arg !== null) {
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
    }).join(' ');
}

function format({ level, category, message, marker = 'none', ms, status, id }) {
    const ctx = store.getStore();
    const label = (id ?? ctx?.reqId ?? ctx?.job ?? '').slice(0, ID_WIDTH);
    const duration = ms === undefined
        ? ' '.repeat(DURATION_WIDTH)
        : paint(durationColour(ms, marker), `${ms}ms`.padStart(DURATION_WIDTH));

    return [
        paint('dim', timestamp()),
        paint(levelColour(level), `[${LEVEL_LABEL[level]}]`),
        paint('blue', `[${category}]`.padEnd(CATEGORY_WIDTH)),
        paint('cyan', label.padEnd(ID_WIDTH)),
        MARKERS[marker],
        duration,
        paint('dim', String(status ?? '').padEnd(3)),
        ` ${redact(message)}`
    ].join(' ');
}

const BOOT_PREFIX = { info: 'ℹ️  [INFO]', warn: '⚠️  [WARN]', error: '❌ [ERROR]', debug: '🐛 [DEBUG]', trace: '🐛 [TRACE]' };

const BATCHED_CATEGORIES = ['CACHE', 'TVDB'];

// Inside a fan-out the per-row lines drop to trace, and the batch owner reports the batch.
function levelFor(entry) {
    const ctx = store.getStore();
    if (!ctx || !ctx.batch || entry.level !== 'debug' || !BATCHED_CATEGORIES.includes(entry.category)) return entry.level;
    ctx.batch.push({ category: entry.category, ms: entry.ms });
    return 'trace';
}

function emit(entry, bootArgs) {
    const level = levelFor(entry);
    if (currentLogLevel < LOG_LEVELS[level]) return;
    if (booting) {
        console.log(`${BOOT_PREFIX[level]} ${entry.message}`, ...(bootArgs ?? []));
        return;
    }
    process.stdout.write(format({ ...entry, level }) + '\n');
}

function makeLogger(category) {
    const at = level => (message, ...rest) => emit({
        level,
        category,
        marker: level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'none',
        message: rest.length ? `${message} ${stringify(rest)}` : String(message)
    }, rest);

    return {
        info: at('info'),
        warn: at('warn'),
        error: at('error'),
        debug: at('debug'),
        trace: at('trace'),
        success: (message, ...rest) => emit({
            level: 'info',
            category,
            marker: 'ok',
            message: rest.length ? `${message} ${stringify(rest)}` : String(message)
        }, rest),
        event: entry => emit({ category, ...entry }),
        // Startup output keeps its old shape even when the phase resolves late.
        boot: (message, ...rest) => {
            if (currentLogLevel < LOG_LEVELS.info) return;
            console.log(`${BOOT_PREFIX.info} ${message}`, ...rest);
        },
        child: sub => makeLogger(sub),
        ready: () => { booting = false; }
    };
}

const logger = makeLogger('APP');

const context = {
    current: () => store.getStore(),
    note(fields) {
        const ctx = store.getStore();
        if (ctx) Object.assign(ctx, fields);
    },
    // Opens a request in the log, so DEBUG states what was asked before any work starts.
    begin(fields) {
        const ctx = store.getStore();
        if (!ctx) return;
        Object.assign(ctx, fields);
        emit({ level: 'debug', category: ctx.category, id: ctx.reqId, message: ctx.subject });
    },
    countCall() {
        const ctx = store.getStore();
        if (ctx) ctx.calls++;
    },
    beginBatch() {
        const ctx = store.getStore();
        if (ctx) ctx.batch = [];
    },
    endBatch() {
        const ctx = store.getStore();
        if (!ctx?.batch) return;
        const samples = ctx.batch;
        ctx.batch = null;

        for (const category of BATCHED_CATEGORIES) {
            const timed = samples.filter(s => s.category === category && typeof s.ms === 'number').map(s => s.ms).sort((a, b) => a - b);
            const count = samples.filter(s => s.category === category).length;
            if (count === 0) continue;
            const spread = timed.length
                ? ` · ${timed[0]}-${timed[timed.length - 1]}ms, median ${timed[Math.floor(timed.length / 2)]}ms`
                : '';
            emit({
                level: 'debug',
                category,
                id: ctx.reqId,
                ms: timed.length ? timed[timed.length - 1] : undefined,
                message: `×${count} ${category === 'CACHE' ? 'lookups' : 'calls'}${spread}`
            });
        }
    },
    runInJob(name, fn) {
        return store.run({ job: name, calls: 0, category: 'UPDATES', start: Date.now() }, fn);
    }
};

function classify(ctx, res, ms, aborted) {
    if (aborted) return { level: 'warn', marker: 'aborted' };
    if (res.statusCode >= 500) return { level: 'error', marker: 'error' };
    if (res.statusCode >= 400) return { level: 'warn', marker: 'warn' };
    if (ms >= VERY_SLOW_MS) return { level: 'warn', marker: 'warn' };
    return { level: 'info', marker: ctx.marker ?? 'ok' };
}

function requestLogger(req, res, next) {
    booting = false;

    const ctx = {
        reqId: crypto.randomBytes(3).toString('hex'),
        calls: 0,
        start: Date.now(),
        category: 'HTTP',
        subject: `${req.method} ${req.originalUrl}`,
        outcome: null,
        marker: null
    };

    store.run(ctx, () => {
        const watchdog = setTimeout(() => {
            emit({
                level: 'warn',
                category: ctx.category,
                marker: 'running',
                id: ctx.reqId,
                ms: Date.now() - ctx.start,
                message: `${ctx.subject} ${paint('dim', '→')} still running`
            });
        }, WATCHDOG_MS);
        watchdog.unref();

        res.on('close', () => {
            clearTimeout(watchdog);
            const ms = Date.now() - ctx.start;
            const aborted = !res.writableFinished;
            const { level, marker } = classify(ctx, res, ms, aborted);

            emit({
                level,
                category: ctx.category,
                marker,
                ms,
                id: ctx.reqId,
                status: aborted ? undefined : res.statusCode,
                message: `${ctx.subject} ${paint('dim', '→')} ${aborted ? 'client gave up' : (ctx.outcome ?? 'served')}`
            });
        });

        next();
    });
}

module.exports = {
    requestLogger,
    logger,
    context,
    MARKERS,
    LOG_LEVELS
};
