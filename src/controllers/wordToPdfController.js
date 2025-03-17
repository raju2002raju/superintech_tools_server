const fetch = require("node-fetch");
const { convertWordToPdf } = require("../services/convertApiService");

async function wordToPdfHandler(req, res) {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const pdfUrl = await convertWordToPdf(req.files.file);

    if (!pdfUrl) {
      return res.status(500).json({ error: "Failed to convert file" });
    }

    // Fetch the converted PDF file
    const pdfResponse = await fetch(pdfUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Send the PDF file as a response
    res.setHeader("Content-Disposition", 'attachment; filename="converted-file.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { wordToPdfHandler };
