import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

const Cloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  });

  const upload = multer();
  app.post("/upload", upload.single("file"), async (req, res) => {
    try {
      const fileData = req.file;

      const base64String = fileData.buffer.toString("base64");

      const result = await cloudinary.uploader.upload(
        "data:image/png;base64," + base64String,
        {
          resource_type: "auto",
        },
        console.log("Uploading...")
      );

      console.log("Uploaded", new Date().toLocaleString());

      res.json({
        resultful: result,
        url: result.url,
        public_id: result.public_id,
        resource_type: result.resource_type,
        result: "Uploaded Successfully",
      });

      const publicId = result.public_id;
      // const timeoutInMilliseconds = 24 * 60 * 60 * 1000;
      const timeoutInMilliseconds = 30 * 1000;

      setTimeout(async () => {
        const resource_type = result.resource_type;
        try {
          // Delete the resource from Cloudinary
          const deletionResult = await cloudinary.api.delete_resources(
            [publicId],
            {
              type: "upload",
              resource_type: resource_type,
            }
          );
          console.log(
            "Deleted from Cloudinary:",
            publicId,
            new Date().toLocaleString()
          );
        } catch (error) {
          console.error("Error deleting from Cloudinary:", error);
        }
      }, timeoutInMilliseconds);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to upload file to Cloudinary" });
    }
  });
};
export default Cloudinary;
