const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const dotenv = require('dotenv');

const admin = require("firebase-admin");
dotenv.config();

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
console.log(process.env.FB_SERVICE_KEY)
const serviceAccount = JSON.parse(decodedKey);
const isAdmin = require('./isAdmin');


const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());






// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q5p2qpd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true
	}
});



admin.initializeApp({
	credential: admin.credential.cert(serviceAccount)
});


const verifyFirebaseToken = async (req, res, next) => {
	const authHeader = req.headers?.authorization;
	console.log(authHeader);
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return res.status(401).send({ message: 'unauthorized access' })
	}

	const token = authHeader.split(' ')[1];

	try {

		const decoded = await admin.auth().verifyIdToken(token);
		console.log('decoded token', decoded);
		req.decoded = decoded;
		next();
	}
	catch (error) {
		return res.status(403).send({ message: 'forbidden access' })
	}

	console.log('token in the middleware', token)

}

async function run() {
	try {


		const tourPackage = client.db("tourDB").collection("tourPackages");
		const tourGuideApplications = client.db("tourDB").collection("tourGuideApplications");
		const tourGuides = client.db("tourDB").collection("tourGuides");
		const bookings = client.db("tourDB").collection("bookings");
		const paymentsCollection = client.db("tourDB").collection("paymentsCollection");
		const usersCollection = client.db("tourDB").collection("usersCollection");
		const assignedToursCollection = client.db("tourDB").collection("assignedToursCollection");
		const touristProfileInfoCollection = client.db("tourDB").collection("touristProfileInfoCollection");
		const adminCollection = client.db("tourDB").collection("adminCollection");
		const usersStoriesCollections = client.db("tourDB").collection("usersStoriesCollections");


		// POST: Add Tour Package
		app.post("/addPackage", async (req, res) => {
			try {
				const { tourType, price, info, email, tourPlan, photos } = req.body;

				const newPackage = {
					tourType,
					price: parseFloat(price),
					info,
					email,
					tourPlan, // If frontend sends as JSON string
					photos: photos // array of image URLs
				};

				const result = await tourPackage.insertOne(newPackage);
				res.status(201).send(result);

			} catch (error) {
				console.error("❌ Error saving package:", error);
				res.status(500).send({ success: false, error: "Failed to save tour package" });
			}
		});


		// GET: Get All Tour Packages
		app.get("/packages", async (req, res) => {
			try {
				const result = await tourPackage.find().toArray();
				res.send(result);
			} catch (err) {
				console.error("❌ Error fetching packages:", err);
				res.status(500).send({ error: "Failed to get tour packages" });
			}
		});
		// GET: get package by id
		app.get('/packages/:id', async (req, res) => {
			const { id } = req.params;
			try {
				const result = await tourPackage.findOne({ _id: new ObjectId(id) });
				if (!result) {
					return res.status(404).send({ message: "Package not found" });
				}
				res.send(result);
			} catch (error) {
				console.error("Error fetching package:", error);
				res.status(500).send({ message: "Server error" });
			}
		});

		// POST: Save a new booking
		app.post('/bookings', async (req, res) => {
			try {
				const booking = req.body;
				booking.tourDate = new Date(booking.tourDate);
				booking.status = 'pending';
				booking.packageId = new ObjectId(booking.packageId);
				booking.guideId = new ObjectId(booking.guideId);

				const result = await bookings.insertOne(booking);
				res.status(201).send({ insertedId: result.insertedId });
			} catch (error) {
				console.error("❌ Error saving booking:", error);
				res.status(500).send({ error: "Failed to save booking" });
			}
		});

		// GET: Get all bookings
		app.get('/bookings', async (req, res) => {
			try {
				const result = await bookings.find().toArray();
				res.send(result);
			} catch (err) {
				console.error("❌ Error fetching bookings:", err);
				res.status(500).send({ error: "Failed to get bookings" });
			}
		});

		// GET bookings by user email
		app.get('/bookingsData/user/:email', async (req, res) => {
			const email = req.params.email;
			try {
				const bookingsUser = await bookings.find({ userEmail: email }).toArray();
				res.send(bookingsUser);
			} catch (error) {
				console.error('Failed to get bookings:', error);
				res.status(500).send({ message: 'Internal Server Error' });
			}
		});

		// delete bookings


		app.delete('/bookingsData/:id', async (req, res) => {
			try {
				const id = req.params.id;


				const booking = await bookings.findOne({ _id: new ObjectId(id) });

				if (!booking) {
					return res.status(404).send({ success: false, message: 'Booking not found.' });
				}


				const deleteResult = await bookings.deleteOne({ _id: new ObjectId(id) });


				const { userEmail, packageName, tourGuideEmail } = booking;

				await assignedToursCollection.deleteOne({
					userEmail,
					packageName,
					tourGuideEmail
				});

				res.send({ success: true, message: 'Booking and assigned tour deleted successfully.' });

			} catch (err) {
				console.error('Delete Booking Error:', err);
				res.status(500).send({ success: false, message: 'Internal Server Error' });
			}
		});






		// POST: Submit Tour Guide Application
		app.post('/tourGuideApplication', async (req, res) => {
			try {
				const { name, email, title, reason, photo, cv } = req.body;

				if (!name || !email || !title || !reason || !photo || !cv) {
					return res.status(400).json({ message: 'Missing required fields' });
				}

				const application = {
					name,
					email,
					photo,
					title,
					reason,
					cv,
					status: 'pending',
					role: 'tourist',
					createdAt: new Date(),
				};

				const result = await tourGuideApplications.insertOne(application);
				res.status(201).json({ message: 'Application submitted successfully', insertedId: result.insertedId });
			} catch (error) {
				console.error('Error submitting application:', error);
				res.status(500).json({ message: 'Internal server error' });
			}
		});

		// GET: All Tour Guide Applications
		app.get('/tourGuideApplication', async (req, res) => {
			const page = parseInt(req.query.page) || 1;
			const limit = parseInt(req.query.limit) || 10;
			const skip = (page - 1) * limit;

			const total = await tourGuideApplications.countDocuments();
			const data = await tourGuideApplications.find().skip(skip).limit(limit).toArray();

			res.send({ data, total });
		});


		// PATCH: Accept Application + Add to Tour Guides
		app.patch('/tourGuideApplication/:id', async (req, res) => {
			const id = req.params.id;
			try {
				const application = await tourGuideApplications.findOne({ _id: new ObjectId(id) });

				if (!application) {
					return res.status(404).send({ error: "Application not found" });
				}

				// Step 1: Update application
				const updateResult = await tourGuideApplications.updateOne(
					{ _id: new ObjectId(id) },
					{ $set: { status: "accepted", role: "tour guide" } }
				);

				// Step 2: Add to tourGuides
				const newGuide = {
					name: application.name,
					email: application.email,
					photo: application.photo,
					role: "tour guide",
					createdAt: new Date()
				};

				const insertResult = await tourGuides.insertOne(newGuide);

				res.send({
					success: true,
					updated: updateResult.modifiedCount > 0,
					addedToTourGuides: insertResult.insertedId ? true : false
				});

			} catch (err) {
				console.error("❌ Error accepting guide:", err);
				res.status(500).send({ error: "Failed to process application" });
			}
		});

		// DELETE: Reject Application
		app.delete('/tourGuideApplication/:id', async (req, res) => {
			const id = req.params.id;
			try {
				const result = await tourGuideApplications.deleteOne({ _id: new ObjectId(id) });
				res.send(result);
			} catch (err) {
				console.error("❌ Error deleting application:", err);
				res.status(500).send({ error: "Failed to delete application" });
			}
		});

		// GET: All Tour Guides
		app.get('/tourGuides', async (req, res) => {
			try {
				const guides = await tourGuides.find().toArray();
				res.send(guides);
			} catch (err) {
				console.error("❌ Error fetching tour guides:", err);
				res.status(500).send({ error: "Failed to get tour guides" });
			}
		});
		// POST: Save Tour Guide Story
		app.post('/tourGuide/stories', async (req, res) => {
			try {
				const { email, title, storyText, imageLinks } = req.body;

				if (!email || !title || !storyText || !imageLinks || !Array.isArray(imageLinks) || imageLinks.length === 0) {
					return res.status(400).send({ success: false, message: 'Missing required fields or image links' });
				}

				const story = {
					_id: new ObjectId(),
					email,
					title,
					storyText,
					images: imageLinks,
					createdAt: new Date()
				};

				const updateResult = await tourGuides.updateOne(
					{ email },
					{ $push: { stories: story } }
				);

				if (updateResult.modifiedCount === 0) {
					return res.status(404).send({ success: false, message: 'Tour guide not found' });
				}

				res.status(201).send({ success: true, message: 'Story saved successfully', story });
			} catch (err) {
				console.error("❌ Error saving story:", err);
				res.status(500).send({ success: false, error: "Failed to save story" });
			}
		});


		// user manage profile

		app.put('/users/profile/:email', async (req, res) => {
			const email = req.params.email;
			const { displayName, photoURL, role } = req.body;

			try {
				const existingUser = await usersCollection.findOne({ email });

				if (!existingUser) {
					// Insert only if not exists
					const newUser = {
						email,
						displayName,
						photoURL,
						role: role || 'user',
					};
					const insertResult = await usersCollection.insertOne(newUser);
					return res.send({ success: true, message: 'User inserted', data: insertResult });
				} else {
					// Update only displayName and photoURL
					const updateResult = await usersCollection.updateOne(
						{ email },
						{
							$set: {
								displayName,
								photoURL,
							}
						}
					);
					return res.send({ success: true, message: 'User updated', data: updateResult });
				}

			} catch (error) {
				console.error('Error saving user:', error);
				res.status(500).send({ success: false, message: 'Internal server error' });
			}
		});






		// ✅ GET: Get All Stories from all tour guides
		app.get('/tourGuide/stories', async (req, res) => {
			try {
				const result = await tourGuides.find().toArray();
				const allStories = [];

				result.forEach(guide => {
					if (guide.stories && guide.stories.length > 0) {
						guide.stories.forEach(story => {
							allStories.push({ ...story, email: guide.email });
						});
					}
				});

				res.send(allStories);
			} catch (err) {
				console.error("❌ Error fetching stories:", err);
				res.status(500).send({ success: false, error: "Failed to get stories" });
			}
		});

		app.get('/tourGuide/profileById/:id', async (req, res) => {
			const id = req.params.id;
			try {
				const guide = await tourGuides.findOne({ _id: new ObjectId(id) });
				if (!guide) return res.status(404).send({ message: 'Tour guide not found' });
				res.send(guide);
			} catch (err) {
				console.error("Error fetching guide:", err);
				res.status(500).send({ message: 'Server error' });
			}
		});


		// backend route for deleting story from tour guide

		// DELETE: Delete a specific story by ID and email
		app.delete('/tourGuide/stories/:id', async (req, res) => {
			const { id } = req.params;
			const { email } = req.query;

			try {
				const updateResult = await tourGuides.updateOne(
					{ email },
					{ $pull: { stories: { _id: new ObjectId(id) } } }
				);

				if (updateResult.modifiedCount === 0) {
					return res.status(404).send({ success: false, message: 'Story not found or already deleted.' });
				}

				res.send({ success: true, message: 'Story deleted successfully.' });
			} catch (err) {
				console.error("❌ Error deleting story:", err);
				res.status(500).send({ success: false, error: "Failed to delete story." });
			}
		});

		// Backend: Required endpoints
		// PATCH - remove image from story
		app.patch('/tourGuide/story/remove-image/:id', async (req, res) => {
			const { id } = req.params;
			const { imageUrl } = req.body;

			try {
				const result = await tourGuides.updateOne(
					{ 'stories._id': new ObjectId(id) },
					{ $pull: { 'stories.$.images': imageUrl } }
				);
				res.send({ success: true, result });
			} catch (err) {
				console.error(err);
				res.status(500).send({ success: false, error: 'Failed to remove image.' });
			}
		});


		// add new image

		app.patch('/tourGuide/story/add-image/:id', async (req, res) => {
			const { id } = req.params;
			const { imageUrl } = req.body;

			try {
				const result = await tourGuides.updateOne(
					{ 'stories._id': new ObjectId(id) },
					{ $push: { 'stories.$.images': imageUrl } }
				);
				res.send({ success: true, result });
			} catch (err) {
				console.error(err);
				res.status(500).send({ success: false, error: 'Failed to add image.' });
			}
		});


		// PATCH - update story details 
		app.patch('/tourGuide/story/update/:id', async (req, res) => {
			const { id } = req.params;
			const { title, storyText } = req.body;

			try {
				const result = await tourGuides.updateOne(
					{ 'stories._id': new ObjectId(id) },
					{
						$set: {
							'stories.$.title': title,
							'stories.$.storyText': storyText
						}
					}
				);
				res.send({ success: true, result });
			} catch (err) {
				console.error(err);
				res.status(500).send({ success: false, error: 'Update failed.' });
			}
		});


		// GET single story
		app.get('/tourGuide/story/:id', async (req, res) => {
			const { id } = req.params;
			try {
				const guide = await tourGuides.findOne({ 'stories._id': new ObjectId(id) });
				const story = guide?.stories?.find(story => story._id.toString() === id);
				res.send(story);
			} catch (err) {
				res.status(500).send({ error: 'Failed to fetch story' });
			}
		});

		// tour guide profile and stories get api

		app.get('/tourGuide/profile', async (req, res) => {
			const { email } = req.query;
			try {
				const guide = await tourGuides.findOne({ email });
				if (!guide) return res.status(404).send({ message: 'Tour guide not found' });
				res.send(guide);
			} catch (err) {
				console.error("❌ Error fetching profile:", err);
				res.status(500).send({ message: 'Server error' });
			}
		});

		app.get('/tourGuide/stories', async (req, res) => {
			const { email } = req.query;
			try {
				const guide = await tourGuides.findOne({ email });
				if (!guide || !guide.stories) return res.send([]);
				res.send(guide.stories);
			} catch (err) {
				console.error("❌ Error fetching stories:", err);
				res.status(500).send({ message: 'Server error' });
			}
		});

		// get random data of tour guide

		app.get('/tourGuides/random', async (req, res) => {
			const guides = await tourGuides.aggregate([{ $sample: { size: 6 } }]).toArray();
			res.send(guides);
		});

		// tour guide by email

		app.get('/tour-guides', async (req, res) => {
			const email = req.query.email;
			if (!email) {
				return res.status(400).send({ message: 'Email is required' });
			}

			const guide = await tourGuides.findOne({ email });

			if (guide) {
				return res.send(guide);
			} else {
				return res.status(404).send({ message: 'Tour guide not found' });
			}
		});

		// PATCH: Update tour guide profile
		app.patch('/tourGuides/:id', async (req, res) => {
			const { id } = req.params;
			const { name, photo } = req.body;

			if (!ObjectId.isValid(id)) {
				return res.status(400).json({ success: false, message: 'Invalid ID' });
			}

			try {
				const result = await tourGuides.updateOne(
					{ _id: new ObjectId(id) },
					{
						$set: {
							name,
							photo,
						},
					}
				);

				if (result.modifiedCount > 0) {
					res.json({ success: true, message: 'Profile updated' });
				} else {
					res.status(404).json({ success: false, message: 'Tour guide not found or no changes made' });
				}
			} catch (error) {
				console.error('Error updating tour guide:', error);
				res.status(500).json({ success: false, message: 'Internal server error' });
			}
		});



		// payment

		app.post('/create-payment-intent', async (req, res) => {
			const { id } = req.body;
			const bookingData = await bookings.findOne({ _id: new ObjectId(id) });
			console.log(bookingData)

			const paymentIntent = await stripe.paymentIntents.create({
				amount: Math.round(bookingData.price * 100),
				currency: 'usd',
				payment_method_types: ['card'],
			});

			res.send({
				clientSecret: paymentIntent.client_secret,
				bookingData,
			});
		});

		app.post('/payments', async (req, res) => {
			const { transactionId, bookingId, amount } = req.body;

			await paymentsCollection.insertOne({
				transactionId,
				bookingId: new ObjectId(bookingId),
				amount,
				date: new Date(),
			});

			await bookings.updateOne(
				{ _id: new ObjectId(bookingId) },
				{ $set: { status: 'in review' } }
			);



			const bookingData = await bookings.findOne({ _id: new ObjectId(bookingId) });

			if (!bookingData) {
				return res.status(404).send({ success: false, message: 'Booking not found' });
			}

			// ✅ Step 4: Update assigned tour
			const userEmail = bookingData.userEmail;
			const packageName = bookingData.packageName;
			const tourGuideEmail = bookingData.tourGuideEmail;

			await assignedToursCollection.updateOne(
				{ userEmail, packageName, tourGuideEmail },
				{ $set: { status: 'in-review' } }
			);
			res.send({ success: true });

		});

		// add user to usersCollections
		app.post('/users', async (req, res) => {
			try {
				const user = req.body;

				// optional: check if user already exists
				const exists = await usersCollection.findOne({ email: user.email });
				if (exists) {
					return res.status(200).send({ message: 'User already exists', insertedId: exists._id });
				}

				const result = await usersCollection.insertOne(user);
				res.status(201).send(result);
			} catch (err) {
				console.error(err);
				res.status(500).send({ message: 'Failed to save user' });
			}
		});

		// // POST /users / google
		// app.post('/users/google', async (req, res) => {
		// 	try {
		// 		const user = req.body;

		// 		if (!user.email) {
		// 			return res.status(400).json({ message: "Email is required" });
		// 		}

		// 		// Check if user already exists
		// 		const existingUser = await req.db.collection('users').findOne({ email: user.email });

		// 		if (existingUser) {
		// 			return res.status(200).json({ message: "User already exists", user: existingUser });
		// 		}

		// 		// Insert new user
		// 		const result = await req.db.collection('users').insertOne(user);

		// 		res.status(201).json({ message: "New Google user added", userId: result.insertedId });

		// 	} catch (error) {
		// 		console.error("Error in /users/google:", error);
		// 		res.status(500).json({ message: "Internal server error" });
		// 	}
		// });


		//user add stories 


		app.post('/add/stories', async (req, res) => {
			try {
				const { email, title, storyText, imageLinks } = req.body;

				if (!email || !title || !storyText || !imageLinks || !Array.isArray(imageLinks) || imageLinks.length === 0) {
					return res.status(400).send({ success: false, message: 'Missing required fields or image links' });
				}

				const story = {
					_id: new ObjectId(),
					email,
					title,
					storyText,
					images: imageLinks,
					createdAt: new Date()
				};

				const updateResult = await usersCollection.updateOne(
					{ email },
					{ $push: { stories: story } }
				);

				if (updateResult.modifiedCount === 0) {
					return res.status(404).send({ success: false, message: 'Tour guide not found' });
				}

				res.status(201).send({ success: true, message: 'Story saved successfully', story });
			} catch (err) {
				console.error("❌ Error saving story:", err);
				res.status(500).send({ success: false, error: "Failed to save story" });
			}
		});





		// ✅ GET: Get All Stories from user
		// ✅ GET: Get All Stories from user
		app.get('/users/stories', async (req, res) => {
			const email = req.query.email;

			try {
				const user = await usersCollection.findOne({ email });

				if (!user) {
					return res.status(404).send({ success: false, message: 'User not found' });
				}

				const stories = user.stories || [];

				res.send(stories);
			} catch (err) {
				console.error("❌ Error fetching user stories:", err);
				res.status(500).send({ success: false, error: "Failed to get user stories" });
			}
		});
		app.get('/users/storiesAll', async (req, res) => {
			try {
				// Fetch all users
				const users = await usersCollection.find({}).toArray();

				// Collect all stories from users
				const allStories = users.flatMap(user => user.stories || []);

				res.send(allStories);
			} catch (err) {
				console.error("❌ Error fetching user stories:", err);
				res.status(500).send({ success: false, error: "Failed to get user stories" });
			}
		});


		// DELETE: Delete a specific story by ID and email
		app.delete('/users/stories/:id', async (req, res) => {
			const { id } = req.params;
			const { email } = req.query;

			try {
				const updateResult = await usersCollection.updateOne(
					{ email },
					{ $pull: { stories: { _id: new ObjectId(id) } } }
				);

				if (updateResult.modifiedCount === 0) {
					return res.status(404).send({ success: false, message: 'Story not found or already deleted.' });
				}

				res.send({ success: true, message: 'Story deleted successfully.' });
			} catch (err) {
				console.error("❌ Error deleting story:", err);
				res.status(500).send({ success: false, error: "Failed to delete story." });
			}
		});

		// GET single story
		app.get('/user/story/:id', async (req, res) => {
			const { id } = req.params;
			try {
				const guide = await usersCollection.findOne({ 'stories._id': new ObjectId(id) });
				const story = guide?.stories?.find(story => story._id.toString() === id);
				res.send(story);
			} catch (err) {
				res.status(500).send({ error: 'Failed to fetch story' });
			}
		});

		// PATCH - remove image from story
		app.patch('/user/story/remove-image/:id', async (req, res) => {
			const { id } = req.params;
			const { imageUrl } = req.body;

			try {
				const result = await usersCollection.updateOne(
					{ 'stories._id': new ObjectId(id) },
					{ $pull: { 'stories.$.images': imageUrl } } // remove only this URL
				);

				res.send({ success: true, result });
			} catch (err) {
				console.error(err);
				res.status(500).send({ success: false, error: 'Failed to remove image link.' });
			}
		});



		// add new image

		app.patch('/user/story/add-image/:id', async (req, res) => {
			const { id } = req.params;
			const { imageUrl } = req.body;

			try {
				const result = await usersCollection.updateOne(
					{ 'stories._id': new ObjectId(id) },
					{ $push: { 'stories.$.images': imageUrl } }
				);
				res.send({ success: true, result });
			} catch (err) {
				console.error(err);
				res.status(500).send({ success: false, error: 'Failed to add image.' });
			}
		});


		// PATCH - update story details 
		app.patch('/user/story/update/:id', async (req, res) => {
			const { id } = req.params;
			const { title, storyText } = req.body;

			try {
				const result = await usersCollection.updateOne(
					{ 'stories._id': new ObjectId(id) },
					{
						$set: {
							'stories.$.title': title,
							'stories.$.storyText': storyText
						}
					}
				);
				res.send({ success: true, result });
			} catch (err) {
				console.error(err);
				res.status(500).send({ success: false, error: 'Update failed.' });
			}
		});


		// GET /users/randomStories?limit=4
		// GET /users/randomStories?limit=4
		app.get('/users/randomStories', async (req, res) => {
			const limit = parseInt(req.query.limit) || 4;

			try {
				const pipeline = [
					{ $match: { stories: { $exists: true, $ne: [] } } },
					{ $unwind: "$stories" },
					{ $sample: { size: limit } },
					{
						$project: {
							title: "$stories.title",
							storyText: "$stories.storyText",
							imageUrls: "$stories.images", // ✅ use field for direct links
							email: "$email"
						}
					}
				];

				const result = await usersCollection.aggregate(pipeline).toArray();
				res.send(result);
			} catch (error) {
				console.error("❌ Error getting random user stories:", error);
				res.status(500).send({ success: false, error: "Failed to load stories" });
			}
		});


		// all stories shows

		app.get('/users/allStories', async (req, res) => {
			try {
				const pipeline = [
					{ $match: { stories: { $exists: true, $ne: [] } } },
					{ $unwind: "$stories" },
					{
						$project: {
							title: "$stories.title",
							storyText: "$stories.storyText",
							imageUrls: "$stories.images", // ✅ directly use links
							email: "$email",
							createdAt: "$stories.createdAt"
						}
					},
					{ $sort: { createdAt: -1 } }
				];

				const stories = await usersCollection.aggregate(pipeline).toArray();
				res.send(stories);
			} catch (error) {
				console.error("❌ Error fetching all stories:", error);
				res.status(500).send({ success: false, error: "Failed to fetch all stories" });
			}
		});



		// assignged Tour guide post


		app.post('/assignedTours', async (req, res) => {
			const assignedTour = req.body;

			try {
				const result = await assignedToursCollection.insertOne(assignedTour);
				res.send({ success: true, insertedId: result.insertedId });
			} catch (error) {
				console.error('Error inserting assigned tour:', error);
				res.status(500).send({ success: false, error: 'Failed to insert assigned tour' });
			}
		});

		// GET: Assigned tours for a tour guide by email
		app.get('/assignedTours/:email', async (req, res) => {
			const email = req.params.email;
			try {
				const tours = await assignedToursCollection.find({ tourGuideEmail: email }).toArray();
				res.send(tours);
			} catch (error) {
				res.status(500).send({ error: 'Failed to fetch assigned tours' });
			}
		});

		// for admin

		app.get('/assignedTours', async (req, res) => {
			const tours = await assignedToursCollection.find().toArray();
			res.send(tours);
		});



		// PATCH accept tour
		app.patch('/assignedTours/accept/:id', async (req, res) => {
			const id = req.params.id;
			const result = await assignedToursCollection.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: { status: 'Accepted' } }
			);
			res.send(result);
		});

		// PATCH reject tour
		app.patch('/assignedTours/reject/:id', async (req, res) => {
			const id = req.params.id;
			const result = await assignedToursCollection.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: { status: 'Rejected' } }
			);
			res.send(result);
		});

		// DELETE: Remove assigned tour when user cancels
		app.delete('/assignedTours/cancel', async (req, res) => {
			const { tourGuideEmail, userEmail, packageName } = req.body;
			try {
				const result = await assignedToursCollection.deleteOne({
					tourGuideEmail,
					userEmail,
					packageName
				});
				res.send({ success: result.deletedCount > 0 });
			} catch (err) {
				res.status(500).send({ error: 'Failed to remove assigned tour' });
			}
		});

		// users profile collections

		app.put('/usersInfo/:email', async (req, res) => {
			const email = req.params.email;
			const profileData = req.body;

			try {
				const result = await touristProfileInfoCollection.updateOne(
					{ email: email },
					{ $set: profileData },
					{ upsert: true }
				);

				res.send({ success: true, message: 'Profile saved', result });
			} catch (error) {
				console.error('Profile update error:', error);
				res.status(500).send({ success: false, message: 'Internal Server Error' });
			}
		});



		// admin section

		// Create admin profile
		app.post('/admin/profile', async (req, res) => {
			const profile = req.body;
			const existing = await adminCollection.findOne({ email: profile.email });
			if (existing) return res.send({ success: false, message: 'Already exists' });

			const result = await usersCollection.insertOne(profile);
			res.send({ success: true, result });
		});

		// Get admin profile
		app.get('/admin/profile/:email', async (req, res) => {
			const email = req.params.email;
			const profile = await adminCollection.findOne({ email });
			res.send(profile || {});
		});


		// Update admin profile
		app.patch('/admin/profile/:email', async (req, res) => {
			const email = req.params.email;
			const { name, photoURL } = req.body;

			const result = await adminCollection.updateOne(
				{ email },
				{ $set: { name, photoURL } }
			);
			res.send({ success: result.modifiedCount > 0 });
		});







		app.get('/admin/stats', verifyFirebaseToken, isAdmin, async (req, res) => {
			try {
				const totalPaymentsResult = await paymentsCollection.aggregate([
					{
						$group: {
							_id: null,
							total: { $sum: '$amount' }
						}
					}
				]).toArray();

				const totalTourGuides = await tourGuides.countDocuments({ role: 'tour guide' });
				const totalClients = await usersCollection.countDocuments({ role: 'user' });
				const totalPackages = await tourPackage.countDocuments();

				// Count all stories in usersCollection (user stories)
				const userStories = await usersCollection.aggregate([
					{ $match: { stories: { $exists: true } } },
					{ $unwind: '$stories' },
					{ $count: 'count' }
				]).toArray();

				// Count all stories in tourGuidesCollection (guide stories)
				const guideStories = await tourGuides.aggregate([
					{ $match: { stories: { $exists: true } } },
					{ $unwind: '$stories' },
					{ $count: 'count' }
				]).toArray();

				const totalStories = (userStories[0]?.count || 0) + (guideStories[0]?.count || 0);

				res.send({
					totalPayments: totalPaymentsResult[0]?.total || 0,
					totalTourGuides,
					totalPackages,
					totalClients,
					totalStories
				});
			} catch (error) {
				res.status(500).send({ error: 'Failed to load admin stats' });
			}
		});


		// search in admin for users
		app.get('/users', async (req, res) => {
			const { search = '', role = '', page = 0, limit = 10 } = req.query;
			const pageNum = parseInt(page);
			const limitNum = parseInt(limit);

			const buildQuery = () => {
				const query = {};
				if (search) {
					query.$or = [
						{ name: { $regex: search, $options: 'i' } },
						{ email: { $regex: search, $options: 'i' } }
					];
				}
				if (role) {
					query.role = role;
				}
				return query;
			};

			try {
				const query = buildQuery();

				const touristsPromise = touristProfileInfoCollection.find(query).toArray();
				const adminsPromise = adminCollection.find(query).toArray();
				const guidesPromise = tourGuides.find(query).toArray();

				const [tourists, admins, guides] = await Promise.all([
					touristsPromise,
					adminsPromise,
					guidesPromise
				]);

				const allUsers = [...tourists, ...admins, ...guides];

				// Sort users by name/email if needed
				const sortedUsers = allUsers.sort((a, b) =>
					(a.name || a.email || '').localeCompare(b.name || b.email || '')
				);

				const paginatedUsers = sortedUsers.slice(pageNum * limitNum, (pageNum + 1) * limitNum);

				res.send({
					users: paginatedUsers,
					total: allUsers.length
				});
			} catch (error) {
				console.error('User fetch error:', error);
				res.status(500).send({ error: 'Internal Server Error' });
			}
		});























		// ✅ MongoDB Ping Log (Restored)
		await client.db("admin").command({ ping: 1 });
		console.log("Pinged your deployment. You successfully connected to MongoDB!");
	} finally {
		// Do not close client
	}
}
run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
	res.send('Server is running');
});

// Start server
app.listen(port, () => {
	console.log(`🚀 Server is running on port ${port}`);
});