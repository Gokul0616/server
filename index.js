import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Sequelize } from "sequelize";
import nodemailer from "nodemailer";
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
const generateToken = () => {
  // Generate a random string of characters to use as the token
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const tokenLength = 32; // You can adjust the length of the token as needed
  let token = "";
  for (let i = 0; i < tokenLength; i++) {
    token += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return token;
};

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
app.post("/api/sendRequest/", async (req, res) => {
  const { senderId, receiverId } = req.body;
  const result = await db.query(
    `INSERT INTO FriendRequests (sender_id, receiver_id) VALUES ('${senderId}','${receiverId}') RETURNING *`
  );
  res.send("success");
});
app.get("/api/checkRequest/:id", async (req, res) => {
  const userId = req.params.id;
  // console.log(userId);
  const result = await db.query(
    `SELECT sender_id, receiver_id FROM FriendRequests WHERE sender_id = '${userId}' OR receiver_id = '${userId}'`
  );
  const ids = result[0]
    .map((item) => [item.sender_id, item.receiver_id])
    .flat();
  const uniqueIds = Array.from(new Set(ids)).filter((id) => id !== userId);
  // console.log(uniqueIds);
  res.json(uniqueIds);
});

app.get("/api/requested/:id", async (req, res) => {
  const userId = req.params.id;
  const result = await db.query(
    `SELECT receiver_id FROM FriendRequests WHERE sender_id = '${userId}' AND status = 'pending'`
  );
  // console.log(result[0]);
  const receiverIds = result[0].map((item) => item.receiver_id);
  const uniqueReceiverIds = [...new Set(receiverIds)]; // Remove duplicates
  // console.log(uniqueReceiverIds);

  res.json(uniqueReceiverIds);
});
app.delete("/api/request-delete/:id/:currId", async (req, res) => {
  const userId = req.params.id;
  const Curruser = req.params.currId;
  // console.log(userId);
  const result = await db.query(
    `DELETE FROM FriendRequests WHERE receiver_id = '${userId}' AND sender_id = '${Curruser}' RETURNING *`
  );
  console.log(result);
  res.send("success");
});
app.get("/api/requests/:id", async (req, res) => {
  const userId = req.params.id;
  const result = await db.query(
    `SELECT sender_id FROM FriendRequests WHERE receiver_id = '${userId}' AND status = 'pending'`
  );
  // console.log(result);
  if (!result[0]) {
    res.json("No Requests");
  } else {
    const senderIds = result[0].map((item) => item.sender_id);
    const uniqueSenderIds = [...new Set(senderIds)]; // Remove duplicates
    // console.log(uniqueSenderIds);
    res.json(uniqueSenderIds);
  }
});
app.post("/api/request-accept/:userid/:currId", async (req, res) => {
  const userId = req.params.userid;
  const Curruser = req.params.currId;
  // console.log(userId);
  // console.log(Curruser);
  const result = await db.query(
    // Update query without RETURNING *
    `UPDATE  friendrequests SET  status = 'accepted' WHERE sender_id = '${userId}'  AND receiver_id = '${Curruser}' RETURNING *`
  );

  if (result[0].length > 0) {
    res.send("success");
  } else {
    res.send("failed");
  }
});
app.get("/api/usermessages/:id", async (req, res) => {
  const userId = req.params.id;
  // console.log(userId);
  try {
    const result = await db.query(
      `SELECT sender_id, receiver_id FROM FriendRequests WHERE (sender_id = '${userId}' OR receiver_id = '${userId}') AND status = 'accepted'`
    );
    // console.log(result[0]);
    const idsArray = result[0].flatMap(({ sender_id, receiver_id }) => [
      sender_id,
      receiver_id,
    ]);

    // console.log(idsArray);
    const uniqueIDs = new Set(idsArray);

    // Convert the Set back to an array
    const uniqueArray = Array.from(uniqueIDs);

    // Remove the userId from the array
    const filteredArray = uniqueArray.filter((id) => id !== userId);

    // console.log(filteredArray);
    res.send(filteredArray);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch user messages" });
  }
});

app.get("/api/message/:id/:currId", async (req, res) => {
  const userId = req.params.id;
  const Curruser = req.params.currId;
  try {
    const result = await db.query(
      `SELECT * from usermessages where sender_id='${userId}' AND receiver_id = '${Curruser}'`
    );
    // console.log(result[0]);
    return res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user messages" });
  }
});
app.post("/api/message/:id/:currUser", async (req, res) => {
  const userId = req.params.id;
  const currUser = req.params.currUser;
  const { message, messageId, timestamp } = req.body;

  // const messageId = uuidv4(); // Generate a random UUID for the message

  try {
    const result = await db.query(
      `INSERT INTO usermessages (message_id, sender_id, receiver_id, message_content,timestamp) VALUES ('${messageId}', '${userId}', '${currUser}', '${message}', '${timestamp}') RETURNING *`
    );
    if (result[0].length > 0) res.send("success");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send message" });
  }
});
app.get("/api/usernewmessage/:id/:currUser", async (req, res) => {
  const userId = req.params.id;
  const currUser = req.params.currUser;
  try {
    const result = await db.query(
      `SELECT * FROM usermessages WHERE 
      (sender_id = '${userId}' OR receiver_id = '${userId}') 
      AND (sender_id = '${currUser}' OR receiver_id = '${currUser}')`
    );
    // console.log(result[0]);
    res.json(result[0]);
  } catch (error) {
    console.error("Error fetching user messages:", error);
    res.status(500).json({ error: "Failed to fetch user messages" });
  }
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: `${process.env.EMAIL}`,
    pass: `${process.env.PASSWORD}`,
  },
});

const sendResetEmail = (email, token) => {
  const resetLink = `${process.env.FRONTEND_PORT}/reset-password?token=${token}`; // Change this URL to your frontend reset password page
  const mailOptions = {
    from: {
      name: "Chaty",
      address: `${process.env.EMAIL}`,
    },
    to: email,
    subject: "Password Reset",
    text: `To reset your password, click on the following link: ${resetLink}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

app.post("/auth/check-user", async (req, res) => {
  const Email = req.body.email;
  // console.log(Email);
  const result = await db.query(`SELECT * FROM users WHERE email = '${Email}'`);
  // console.log(result[0]);
  const token = generateToken();
  if (result[0].length > 0) {
    const checkResult = await db.query(
      `SELECT * FROM PasswordReset WHERE email = '${Email}'`
    );
    // console.log(checkResult[0].length == 0);

    if (checkResult[0].length > 0) {
      await db.query(
        `UPDATE  PasswordReset set token = '${token}' ,visit = false where email='${Email}'`
      );
      sendResetEmail(Email, token);

      res.send("success");
    } else if (checkResult[0].length == 0) {
      await db.query(
        `INSERT INTO   PasswordReset  (email, token) VALUES ('${Email}', '${token}')`
      );
      sendResetEmail(Email, token);
      res.send("success");
    }
  } else {
    res.send("failure");
  }
});
app.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  // console.log(token);
  try {
    // Check if the token is valid for the given email
    const resetToken = await db.query(
      `SELECT * FROM PasswordReset WHERE token = '${token}'`
    );
    // console.log(resetToken[0][0]);
    const visit = resetToken[0][0].visit;
    const email = resetToken[0][0].email;
    if (visit == false) {
      // // Update the user's password in the database
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.query(
        `UPDATE users SET password = '${hashedPassword}' WHERE email = '${email}'`
      );
      await db.query(
        `DELETE FROM PasswordReset WHERE email = '${email}' AND token = '${token}'`
      );

      res.status(200).json({ message: "Password reset successfully" });
    } else {
      return res.json({ error: "Invalid or expired token" });
    }
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/auth/check-reset-password", async (req, res) => {
  const token = req.body.token;
  //  console.log(token);
  const resetToken = await db.query(
    `SELECT * FROM PasswordReset WHERE token = '${token}'`
  );
  //  console.log(resetToken[0].length > 0);
  if (resetToken[0].length > 0) {
    res.send("success");
  } else {
    res.send("failure");
  }
});

app.get("/api/usermessages/read/:id/:currId", async (req, res) => {
  const currId = req.params.currId;
  const id = req.params.id;
  //  console.log(currId, id);
  const result = await db.query(
    `UPDATE usermessages SET is_read = true WHERE sender_id = '${id}' AND receiver_id = '${currId}'`
  );
});
app.get("/api/usermessages/unread-count/:id/:sendId", async (req, res) => {
  const sendId = req.params.sendId;
  const id = req.params.id;
  //  console.log(sendId, id);
  try {
    const result = await db.query(
      `SELECT COUNT(*) AS unreadCount FROM usermessages WHERE receiver_id = '${sendId}' AND sender_id = '${id}' AND is_read = false`
    );

    const unreadCount = result[0][0].unreadcount;
    const lastMessageQuery = `
      SELECT *
      FROM usermessages
      WHERE receiver_id = '${sendId}' AND sender_id = '${id}'
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    const lastMessageResult = await db.query(lastMessageQuery);
    const lastmessage = lastMessageResult[0][0].message_content;
    res.json({ unreadCount, lastmessage });
  } catch (error) {
    console.error("Error counting unread messages:", error);
    res.status(500).json({ error: "Failed to count unread messages" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
