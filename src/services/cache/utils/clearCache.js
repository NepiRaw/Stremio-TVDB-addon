const { MongoClient } = require('mongodb');
const readline = require('readline');
require('dotenv').config();

async function clearCache() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGO_DB_NAME || 'stremio-tvdb-cache';

    console.log(`Connecting to MongoDB at ${mongoUri}...`);

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log('Connected to MongoDB.');

        const db = client.db(dbName);

        // List all collections and their item counts
        const collections = await db.listCollections().toArray();
        const collectionDetails = [];

        for (const collection of collections) {
            const count = await db.collection(collection.name).countDocuments();
            collectionDetails.push({ name: collection.name, count });
            console.log(`Collection: ${collection.name}, Items: ${count}`);
        }

        // Prompt user for confirmation
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Do you want to delete all cache collections? (yes/no): ', async (answer) => {
            if (answer.toLowerCase() === 'yes') {
                for (const collection of collectionDetails) {
                    if (collection.name.includes('cache')) {
                        console.log(`Dropping collection: ${collection.name}`);
                        await db.collection(collection.name).drop();
                    }
                }
                console.log('Cache cleared successfully.');
            } else {
                console.log('Operation cancelled.');
            }

            rl.close();
            await client.close();
            console.log('MongoDB connection closed.');
        });
    } catch (error) {
        console.error('Error clearing cache:', error.message);
        await client.close();
        console.log('MongoDB connection closed.');
    }
}

// Run the script
clearCache();