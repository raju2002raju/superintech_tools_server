const convertapi = require("../config/convertApiConfig");
const fs = require("fs");
const path = require("path");

async function convertWordToPdf(wordFile) {
  const uploadPath = path.join(__dirname, "..", "uploads", wordFile.name);

  try {
    // Save the uploaded file temporarily
    await wordFile.mv(uploadPath);

    // Convert the file using ConvertAPI
    const result = await convertapi.convert("pdf", { File: uploadPath });

    // Get the converted PDF file URL
    const pdfFile = result.files[0];

    // Clean up the temporary Word file
    fs.unlinkSync(uploadPath);

    return pdfFile ? pdfFile.url : null;
  } catch (error) {
    console.error("File conversion failed:", error);
    throw new Error("File conversion failed");
  }
}

module.exports = { convertWordToPdf };
