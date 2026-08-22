<template>
  <div id="app" class="min-h-screen flex items-center justify-center p-5">
    <div class="bg-card-bg rounded-3xl p-10 shadow-2xl text-center max-w-[700px] w-full animate-slide-up border border-primary/15">
      <!-- Logo -->
      <img 
        src="https://thetvdb.com/images/logo.svg" 
        alt="TVDB Logo" 
        class="max-w-56 h-auto mx-auto mb-8 drop-shadow-md"
        width="220" 
        height="94" 
        decoding="async"
      >
      
      <!-- Title and Version -->
      <h1 class="text-white text-[2.5rem] mb-3 font-bold drop-shadow-md">{{ appConfig.ui?.title || 'TVDB Addon' }}</h1>
      <div class="mb-8">
        <span class="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1 text-primary-light text-[0.9rem] font-medium tracking-wide">
          <i class="fas fa-code-branch text-[0.8rem]"></i>
          v{{ version }}
        </span>
      </div>
      
      <!-- Description -->
      <div class="text-gray-300 text-[1.2rem] leading-relaxed mb-10">
        <template v-if="appConfig.ui?.description">
          {{ appConfig.ui.description }}
          <img
            src="https://thetvdb.com/images/logo.svg"
            alt="TVDB"
            style="display:inline;vertical-align:middle;width:2.2em;height:1em;margin:0 0.2em;filter:brightness(0) invert(1);"
          />
          search functionality with detailed metadata for movies, series, and anime.
        </template>
        <template v-else>
          Loading...
        </template>
      </div>

      <!-- Features -->
      <div class="bg-card-secondary rounded-2xl p-8 mb-10 border border-primary/10">
        <h3 class="text-primary mb-5 text-[1.3rem] flex items-center justify-center gap-3">
          <i class="fas fa-star"></i> What You'll Get
        </h3>
        <ul class="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
          <li 
            v-for="feature in appConfig.ui?.features || ['Movies', 'TV Series', 'Anime']" 
            :key="feature"
            class="bg-card-tertiary p-5 rounded-xl shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-custom-hover border border-primary/10"
          >
            <i :class="getFeatureIcon(feature)" class="text-primary text-[2rem] mb-3 block"></i>
            <span class="text-white font-semibold">{{ feature }}</span>
          </li>
        </ul>
      </div>

      <!-- Language Configuration -->
      <div class="my-8 p-6 bg-card-secondary rounded-2xl shadow-lg border border-primary/10">
        <div class="mb-5">
          <label for="languageSelect" class="font-semibold text-[16px] text-white mb-2 flex items-center justify-start gap-2">
            <i class="fas fa-globe"></i> Preferred Language
            <span class="info-tooltip" data-tooltip="Choose your preferred language for metadata. If not available, will fallback to English, then first available language.">
              <i class="fas fa-info-circle"></i>
            </span>
          </label>
          <div class="select-wrapper">
            <select 
              id="languageSelect" 
              v-model="selectedLanguage"
              @change="saveLanguage"
              class="language-select w-full"
            >
              <option value="eng">English - Default</option>
              <option value="fra">Français (French)</option>
              <option value="spa">Español (Spanish)</option>
              <option value="deu">Deutsch (German)</option>
              <option value="ita">Italiano (Italian)</option>
              <option value="por">Português (Portuguese)</option>
              <option value="jpn">日本語 (Japanese)</option>
              <option value="kor">한국어 (Korean)</option>
              <option value="chi">中文 (Chinese)</option>
              <option value="rus">Русский (Russian)</option>
              <option value="ara">العربية (Arabic)</option>
            </select>
          </div>
        </div>
      </div>
      
      <!-- Install Button -->
      <div class="install-container">
        <button 
          @click="handleInstall"
          class="install-btn"
          :disabled="isInstalling"
        >
          <i :class="isInstalling ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
          {{ isInstalling ? 'Opening...' : 'Install Addon' }}
        </button>
        <button 
          @click="toggleDropdown"
          class="install-dropdown-btn"
        >
          <i class="fas fa-chevron-down"></i>
        </button>
        
        <!-- Dropdown Menu (expands right) -->
        <div 
          v-show="showDropdown"
          class="dropdown-menu"
          style="left: 100%; top: 0; right: auto; margin-left: 10px; margin-top: 0;"
        >
          <a 
            v-for="item in dropdownItems" 
            :key="item.action"
            @click.prevent="handleInstallAction(item.action)"
            href="#" 
            class="dropdown-item"
          >
            <i :class="item.icon"></i> {{ item.text }}
          </a>
        </div>
      </div>

      <!-- GitHub Link -->
      <div class="mt-8 text-center">
        <a 
          href="https://github.com/NepiRaw/Stremio-TVDB-addon" 
          target="_blank" 
          class="github-badge"
        >
          <i class="fab fa-github"></i>
          <span>View on GitHub</span>
        </a>
      </div>
    </div>

    <!-- Notification -->
    <Notification 
      :show="notification.show"
      :text="notification.text"
    />
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import Notification from './components/Notification.vue'

export default {
  name: 'App',
  components: {
    Notification
  },
  setup() {
    const version = ref('Loading...')
    const selectedLanguage = ref('eng')
    const showDropdown = ref(false)
    const isInstalling = ref(false)
    const shouldShowDropdownUp = ref(false)
    const manifestUrlTemplate = ref('')
    
    const appConfig = ref({})
    
    const notification = reactive({
      show: false,
      text: ''
    })

    const dropdownItems = [
      { action: 'install', icon: 'fas fa-desktop', text: 'Install for Desktop' },
      { action: 'web', icon: 'fas fa-window-maximize', text: 'Install for Web' },
      { action: 'copy', icon: 'fas fa-copy', text: 'Copy Manifest URL' }
    ]

    const getFeatureIcon = (feature) => {
      const iconMap = {
        'Movies': 'fas fa-film',
        'TV Series': 'fas fa-tv', 
        'Anime': 'fas fa-dragon'
      }
      return iconMap[feature] || 'fas fa-star'
    }

    const loadAppConfig = async () => {
      try {
        const response = await fetch('/api/app-config');
        if (response.ok) {
          const config = await response.json();
          appConfig.value = config;
          version.value = config.version;
          manifestUrlTemplate.value = config.manifestUrlTemplate;
          if (config.ui && config.ui.title) {
            document.title = config.ui.title + ' - Stremio Addon';
          }
        } else {
          console.warn('Failed to load app config');
          version.value = 'Unknown';
          appConfig.value = { ui: { title: 'TVDB Addon', description: 'Loading...' } };
          document.title = 'TVDB Addon - Stremio Addon';
        }
      } catch (error) {
        console.error('Error loading app config:', error);
        version.value = 'Error';
        appConfig.value = { ui: { title: 'TVDB Addon', description: 'Error loading configuration' } };
        document.title = 'TVDB Addon - Stremio Addon';
      }
    }

    const saveLanguage = () => {
      localStorage.setItem('tvdb-addon-language', selectedLanguage.value)
    }

    const toggleDropdown = (e) => {
      e.stopPropagation()
      
      if (!showDropdown.value) {
        const button = e.currentTarget
        const buttonRect = button.getBoundingClientRect()
        const dropdownHeight = 150 // Approximate height of dropdown
        const spaceBelow = window.innerHeight - buttonRect.bottom
        
        shouldShowDropdownUp.value = spaceBelow < dropdownHeight
      }
      
      showDropdown.value = !showDropdown.value
    }

    const handleInstall = () => {
      handleInstallAction('install')
    }

    const handleInstallAction = (action) => {
      const manifestUrl = getManifestUrl()
      const manifestHost = manifestUrl.replace(/^https?:\/\//, '')

      const actions = {
        install: () => window.location.href = `stremio://${manifestHost}`,
        web: () => window.open(`https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`, '_blank'),
        copy: () => {
          navigator.clipboard.writeText(manifestUrl)
          showNotification('Manifest URL copied!')
        }
      }

      if (actions[action]) {
        if (action !== 'copy') {
          isInstalling.value = true
          setTimeout(() => {
            isInstalling.value = false
          }, 3000)
        }
        actions[action]()
      }
      
      showDropdown.value = false
    }

    const getManifestUrl = () => {
      if (!manifestUrlTemplate.value) return ''
            
      return manifestUrlTemplate.value.replace('{{LANG}}', selectedLanguage.value)
    }

    const showNotification = (text) => {
      notification.text = text
      notification.show = true
      setTimeout(() => {
        notification.show = false
      }, 3000)
    }

    const loadInitialState = () => {
      selectedLanguage.value = localStorage.getItem('tvdb-addon-language') || 'eng'
      clearLegacyCatalogStorage()
    }

    // Catalog customisation was removed; drop the keys older builds left behind.
    const clearLegacyCatalogStorage = () => {
      const stale = ['tvdb-addon-advanced-open', 'tvdb-addon-active-tab']
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && /^tvdb-addon-(movies|series|anime)-/.test(key)) stale.push(key)
      }
      stale.forEach(key => localStorage.removeItem(key))
    }

    const handleClickOutside = (e) => {
      if (!e.target.closest('.install-container')) {
        showDropdown.value = false
      }
    }

    onMounted(async () => {
      await loadAppConfig()
      loadInitialState()
      document.addEventListener('click', handleClickOutside)
    })

    onUnmounted(() => {
      document.removeEventListener('click', handleClickOutside)
    })

    return {
      version,
      selectedLanguage,
      showDropdown,
      isInstalling,
      notification,
      dropdownItems,
      appConfig,
      getFeatureIcon,
      saveLanguage,
      toggleDropdown,
      handleInstall,
      handleInstallAction
    }
  }
}

</script>
<style scoped>
.notification.show {
  transform: translateX(0);
}
.notification {
  transform: translateX(150%);
  transition: transform 0.3s ease;
  position: fixed;
  top: 20px;
  right: 20px;
  background: #00A86B;
  color: white;
  padding: 15px 25px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1000;
}
</style>