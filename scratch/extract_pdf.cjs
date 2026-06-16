const fs = require('fs');
const pdf = require('pdf-parse');

console.log('Type of pdf:', typeof pdf);
console.log('Keys of pdf:', Object.keys(pdf));

let dataBuffer = fs.readFileSync('yazilimhatalari.pdf');

if (typeof pdf === 'function') {
    pdf(dataBuffer).then(function(data) {
        fs.writeFileSync('extracted_text.txt', data.text);
        console.log('Text extracted to extracted_text.txt');
    });
} else if (pdf.default && typeof pdf.default === 'function') {
    pdf.default(dataBuffer).then(function(data) {
        fs.writeFileSync('extracted_text.txt', data.text);
        console.log('Text extracted to extracted_text.txt');
    });
} else {
    console.log('Could not find pdf function');
}
