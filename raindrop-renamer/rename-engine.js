const fs = require('fs');
const path = require('path');

/**
 * CONFIGURATION
 * Edit these values before running
 */
const CONFIG = {
    sourceDir: './input-droplets', // Where your 14 original files are
    outputDir: './launchmynft-upload', // Where the renamed files will go
    totalSize: 1000,
    projectName: 'Raindrop Collection',
    description: 'A unique droplet in the RandyVerse',
    premintRange: [1, 10], // Files 1 through 10 are special
};

// Check if input directory exists
if (!fs.existsSync(CONFIG.sourceDir)) {
    console.error(`Error: Source directory "${CONFIG.sourceDir}" does not exist.`);
    console.log('Please create the folder and put your 14 master droplets there.');
    process.exit(1);
}

// Create output directory
if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

// Read master files
const masterFiles = fs.readdirSync(CONFIG.sourceDir)
    .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

if (masterFiles.length === 0) {
    console.error('No image files found in input directory!');
    process.exit(1);
}

console.log(`Found ${masterFiles.length} master droplets. Generating ${CONFIG.totalSize} NFTs...`);

/**
 * Generate Metadata JSON
 */
function createMetadata(id, dropletName) {
    return {
        name: `${CONFIG.projectName} #${id}`,
        description: CONFIG.description,
        image: `${id}.png`,
        attributes: [
            {
                trait_type: "Droplet Type",
                value: dropletName
            },
            {
                trait_type: "Collection",
                value: "RandyVerse"
            }
        ],
        properties: {
            files: [{ uri: `${id}.png`, type: "image/png" }],
            category: "image"
        }
    };
}

// Main processing loop
for (let i = 1; i <= CONFIG.totalSize; i++) {
    // Determine which master file to use (round-robin for even distribution)
    const masterIndex = (i - 1) % masterFiles.length;
    const sourceFile = masterFiles[masterIndex];
    const dropletName = path.parse(sourceFile).name;

    const targetImageName = `${i}.png`;
    const targetJsonName = `${i}.json`;

    // Copy Image
    fs.copyFileSync(
        path.join(CONFIG.sourceDir, sourceFile),
        path.join(CONFIG.outputDir, targetImageName)
    );

    // Write JSON Metadata
    fs.writeFileSync(
        path.join(CONFIG.outputDir, targetJsonName),
        JSON.stringify(createMetadata(i, dropletName), null, 2)
    );

    if (i % 100 === 0) {
        console.log(`Progress: ${i}/${CONFIG.totalSize} processed...`);
    }
}

console.log('Done! Your collection is ready for Launchmynft.io in the folder:', CONFIG.outputDir);
