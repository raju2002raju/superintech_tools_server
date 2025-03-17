const express = require('express');
require('dotenv').config();
const fileUpload = require("express-fileupload");
const wordToPdfRoutes = require("./routes/wordToPdfRoutes");
const plotRoutes = require('./routes/plotRoutes');
const downloaderRoutes = require("./routes/downloaderRoutes");
const cors = require('cors')
const app = express();


app.use(fileUpload());
app.use(cors());
app.use(express.json());
app.use('/v1/api', plotRoutes);
app.use("/v1/api", wordToPdfRoutes);
app.use("/v1/api", downloaderRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;