import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Sequelize } from "sequelize";
dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();
app.use(cors());
app.use(bodyParser.json());
//database
const db = new Sequelize(process.env.DB_URL, {
  dialect: "postgres",
  logging: false, // remove to see queries in console
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});
db.sync().then(() => console.log("Database connected"));
// Temporary in-memory database (replace with your actual database)

// Signup endpoint

app.post("/api/signup", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  try {
    const existingUser = await db.query(
      `SELECT * FROM users WHERE email = '${email}'`
    );

    if (existingUser[0].length > 0) {
      return res.json({ error: "User already exists" });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const uuid = uuidv4();
      const result = await db.query(
        `INSERT INTO users(id, firstname, lastname, email, password) VALUES('${uuid}', '${firstname}', '${lastname}', '${email}', '${hashedPassword}') RETURNING *`
      );
      const resultDetails = await db.query(
        `INSERT INTO user_details(user_id, firstname, lastname, email) VALUES('${uuid}', '${firstname}', '${lastname}', '${email}') RETURNING *`
      );

      res.json(result[0][0]);
    }
  } catch (error) {
    console.error("Error signing up user:", error);
    res.json({ error: "Error signing up user" });
  }
});

app.post("/api/signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
    if (!user[0].length > 0) {
      return res.json({ error: "User not found" });
    }
    const userData = user[0][0];
    const passwordMatch = await bcrypt.compare(password, userData.password);
    if (!passwordMatch) {
      return res.json({ error: "Invalid email or password" });
    }
    // const token = jwt.sign({ userId: userData.id }, process.env.JWT_SECRET, {
    //   expiresIn: "1h",
    // });
    // res.status(200).json({ token });
    res.send({ userData, result: "Successful" });
  } catch (error) {
    console.error("Error signing in user:", error);
    res.json({ error: "Error signing in user" });
  }
});

app.get("/api/user/:userId", async (req, res) => {
  const userId = req.params.userId;
  const result = await db.query(
    `SELECT * FROM user_details WHERE user_id = '${userId}'`
  );
  // console.log(result[0][0]);
  const user = result[0][0];
  // console.log();
  if (user) {
    return res.json(user);
  } else {
    res.json(user > 0);
  }
});

//cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const upload = multer();

app.post("/upload/:id", upload.single("file"), async (req, res) => {
  const userId = req.params.id;
  // console.log(req.file);
  try {
    // Check if a file was uploaded
    if (req.file) {
      const fileData = req.file;

      const base64String = fileData.buffer.toString("base64");

      const result = await cloudinary.uploader.upload(
        "data:image/png;base64," + base64String,
        {
          resource_type: "auto",
        },
        console.log("Uploading...")
      );
      // console.log(result);
      console.log("Uploaded", new Date().toLocaleString());
      const URL = result.url;
      // console.log(URL);
      const resultDetails = await db.query(
        `UPDATE  user_details SET  profileurl = '${URL}' WHERE user_id = '${userId}' RETURNING *`
      );

      // console.log(resultDetails);
      res.json({
        result: "Uploaded Successfully",
        URL,
      });
      const publicId = result.public_id;
      const timeoutInMilliseconds = 7 * 24 * 60 * 60 * 1000;
      // const timeoutInMilliseconds = 30 * 1000;

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
      // res.send(result.url);
    } else {
      let updateFields = "";
      const updateValues = [];

      // Check if each field exists in the request body and add it to the updateFields string
      if (req.body.firstName) {
        updateFields += `firstname = '${req.body.firstName}', `;
      }
      if (req.body.lastName) {
        updateFields += `lastname = '${req.body.lastName}', `;
      }
      if (req.body.bio) {
        updateFields += `bio = '${req.body.bio}', `;
      }
      if (req.body.dob) {
        updateFields += `dob = '${req.body.dob}', `;
      }
      if (req.body.phoneNumber) {
        updateFields += `phone_number = '${req.body.phoneNumber}', `;
      }
      if (req.body.gender) {
        updateFields += `gender = '${req.body.gender}', `;
      }

      // Remove trailing comma and space from updateFields
      updateFields = updateFields.trim().slice(0, -1);

      // Construct the SQL query with parameterized values
      let sqlQuery = `UPDATE user_details SET ${updateFields} WHERE user_id = '${userId}' RETURNING *`;

      // Execute the SQL query with the parameterized values
      const result = await db.query(sqlQuery, updateValues);
      res.json({ result: "Uploaded Successfully", result });
    }
  } catch (error) {
    console.error("Error updating user details:", error);
    res.json({ error: "Failed to update user details" });
  }
});

app.get("/api/users/:id", async (req, res) => {
  const userId = req.params.id;
  // console.log(userId);

  try {
    const result = await db.query(
      `SELECT * FROM user_details WHERE user_id != '${userId}'`
    );
    const usersDetails = result;
    // console.log(usersDetails[0]);

    if (usersDetails.length > 0) {
      res.json(usersDetails[0]);
    }
  } catch (error) {
    console.error("Error fetching users details:", error);
    res.status(500).json({ error: "Failed to fetch users details" });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
