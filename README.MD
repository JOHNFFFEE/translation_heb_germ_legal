# PDF Certificate Generator 📜✨

## Overview ℹ️

This project is a web-based tool designed to process PDF documents, extract data (particularly in Hebrew and English), and generate certificates such as marriage or divorce certificates in German. It leverages OCR (Optical Character Recognition) with Tesseract.js, PDF.js for PDF processing, and HTML/CSS for rendering the generated certificates. Extracted data is populated into predefined templates, which can be exported as PDFs without headers or footers.

## Features 🌟

- PDF Upload 📤: Upload PDF files for data extraction.
- OCR Support 👁️: Text recognition in Hebrew and English using Tesseract.js.
- Data Parsing 🔍: Mapping of extracted text to fields (e.g., first name, family name, date of birth).
- Templates 📑: Generation of marriage and divorce certificates based on selected templates.
- Translation 🌍: All output is translated into German using a predefined translation dictionary
- PDF Export 💾: Export generated certificates as PDFs without headers or footers.

## Prerequisites 🛠️

To run this project locally, ensure you have the following:

- A modern web browser (e.g., Chrome, Firefox) 🌐.
- A local web server (e.g., Node.js with http-server, Python’s http.server, or any equivalent) 🖥️
- Internet access (for loading external libraries like PDF.js and Tesseract.js from CDNs) 📡.
- Templates: Generation of marriage and divorce certificates based on selected templates.

## Installation 🚀

1. Clone the Repository 📂:
   ```bash
   git clone https://github.com/JOHNFEE/translation_heb_germ_legal.git
   ```
2. Navigate to the project directory:
   ```bash
   cd translation_heb_germ_legal
   ```
3. Open the `index.html` file in your browser.

## Project Structure 🗃️:

Ensure the following files are present in your project directory:

- index.html: The main HTML file containing the UI (upload input, template selector, and display area).
- script.js: The JavaScript file with the core logic (provided in your code).
- translations_clean_german.json: The translation dictionary for mapping Hebrew/English terms to German.

## Usage 🎯

1. Open the Application 🚪: Navigate to the URL provided by your local server (e.g., http://localhost:8080).
2. Upload a PDF 📤:

- Select a PDF file containing data in Hebrew and/or English (e.g., an official document like a marriage or divorce certificate).
- Click the upload button or trigger the processPDF() function.

3. Choose a Template 📋:

- From the dropdown (e.g., template-select), select either "Marriage Certificate" or "Divorce Certificate"

4. View and Edit ✏️:

- The extracted data will be populated into the selected template, displayed on the page.
- Fields are editable (via contenteditable="true") if adjustments are needed.

5. EExport as PDF 💾:

- Click the export button (you’ll need to add this functionality—see "Adding Export Functionality" below) to download the certificate as a PDF without headers or footers.

## Adding Export Functionality 📄

The current code renders templates in HTML but lacks an explicit PDF export function. To export the certificate as a PDF without headers/footers, add the following JavaScript function and button to your code

## Dependencies 📚

- PDF.js: For PDF rendering and text extraction (https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js).
- Tesseract.js: For OCR (loaded dynamically in the script).
- html2pdf.js: For PDF export (optional, see "Adding Export Functionality").

## Notes 📝

- OCR Accuracy 👀: Results depend on the quality of the uploaded PDF and the clarity of text. Adjust the grayscale, contrast, and brightness filters in processPDF() if needed.
- Translations 🌐: The translations_clean_german.json file must be in the same directory as script.js or adjust the germanTranslations path accordingly.
- Limitations ⚠️: The tool assumes specific field names in Hebrew (e.g., "שם פרטי" for "First Name"). Expand hebrewFieldMap for additional fields.

## Contributing 🤝

Feel free to submit issues or pull requests to enhance functionality, such as:

- Adding support for more certificate types 📜.
- Improving OCR accuracy with preprocessing options 🔧.
- Expanding the translation dictionary 📖.

Please follow these steps:

1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add feature-name"
   ```
4. Push to the branch:
   ```bash
   git push origin feature-name
   ```
5. Open a pull request.

## License 📜

This project is licensed under the [MIT License](LICENSE).
