/**
 * Generate QR Code for the index page
 * Usage: node scripts/generate-qrcode.js
 */

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const URL = 'https://wedding.hoangyen.io.vn';
const OUTPUT_FILE = 'index.qrcode.png';

async function generateQRCode() {
  try {
    const outputPath = path.join(__dirname, '..', OUTPUT_FILE);
    
    await QRCode.toFile(outputPath, URL, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    });
    
    console.log(`✅ QR Code generated successfully!`);
    console.log(`   URL: ${URL}`);
    console.log(`   Output: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error generating QR code:', error.message);
    process.exit(1);
  }
}

generateQRCode();