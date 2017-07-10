var express = require("express");
var bodyParser = require("body-parser");
var mongodb = require("mongodb");
var session = require("express-session");
var crypto = require("crypto");
var jsforce = require("jsforce");
var ObjectID = mongodb.ObjectID;

var CONTACTS_COLLECTION = "contacts";

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'sfcanvasapp301984567',
  salesforce: {}
}));
// Create link to Angular build directory
var distDir = __dirname + "/dist/";
app.use(express.static(distDir));

// Create a database variable outside of the database connection callback to reuse the connection pool in your app.
var db;
var usrctxt;


// Connect to the database before starting the application server.
mongodb.MongoClient.connect(process.env.MONGODB_URI, function (err, database) {
  if (err) {
    console.log(err);
    process.exit(1);
  }

  // Save database object from the callback for reuse.
  db = database;
  console.log("Database connection ready");

  // Initialize the app.
  var server = app.listen(process.env.PORT || 8080, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
  });
});

// CONTACTS API ROUTES BELOW

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}

/*  "/api/contacts"
 *    GET: finds all contacts
 *    POST: creates a new contact
 */

app.get("/api/contacts", function(req, res) {
  db.collection(CONTACTS_COLLECTION).find({}).toArray(function(err, docs) {
    if (err) {
      handleError(res, err.message, "Failed to get contacts.");
    } else {
      res.status(200).json(docs);
    }
  });
});

app.post("/api/contacts", function(req, res) {
  var newContact = req.body;
  newContact.createDate = new Date();

  if (!req.body.name) {
    handleError(res, "Invalid user input", "Must provide a name.", 400);
  }

  db.collection(CONTACTS_COLLECTION).insertOne(newContact, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to create new contact.");
    } else {
      res.status(201).json(doc.ops[0]);
    }
  });
  
  if(req.session.salesforce && req.session.salesforce.client) {
      var fullName = newContact.name.split(" ");
      var sr = req.session.salesforce;
      var conn = new jsforce.Connection({
        instanceUrl : sr.client.instanceUrl,
        accessToken : sr.client.oauthToken
      });
      conn.sobject("Contact").create({ FirstName: fullName[0], 
                   LastName : fullName[1],
                   Email: newContact.email,
                   Phone: newContact.phone.work,
                   MobilePhone: newContact.phone.mobile
                 }, function(err, ret) {
                      if (err || !ret.success) { return console.log(err, ret); }
                      console.log("Created record id : " + ret.id);
      
                });
        }
});

/*  "/api/contacts/:id"
 *    GET: find contact by id
 *    PUT: update contact by id
 *    DELETE: deletes contact by id
 */

app.get("/api/contacts/:id", function(req, res) {
  db.collection(CONTACTS_COLLECTION).findOne({ _id: new ObjectID(req.params.id) }, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to get contact");
    } else {
      res.status(200).json(doc);
    }
  });
});

app.put("/api/contacts/:id", function(req, res) {
  var updateDoc = req.body;
  delete updateDoc._id;

  db.collection(CONTACTS_COLLECTION).updateOne({_id: new ObjectID(req.params.id)}, updateDoc, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to update contact");
    } else {
      updateDoc._id = req.params.id;
      res.status(200).json(updateDoc);
    }
  });
});

app.delete("/api/contacts/:id", function(req, res) {
  db.collection(CONTACTS_COLLECTION).deleteOne({_id: new ObjectID(req.params.id)}, function(err, result) {
    if (err) {
      handleError(res, err.message, "Failed to delete contact");
    } else {
      res.status(200).json(req.params.id);
    }
  });
});

app.post("/api/authenticate", function(req, res) {
   var bodyArray = req.body.signed_request.split(".");
   var consumerSecret = bodyArray[0];
   var encoded_envelope = bodyArray[1];
   var check = crypto.createHmac("sha256", process.env.CANVAS_CONSUMER_SECRET).update(encoded_envelope).digest("base64");

    if (check === consumerSecret) {

        var envelope = JSON.parse(new Buffer(encoded_envelope, "base64").toString("ascii"));
        req.session.salesforce = envelope;
        console.log("got the session object:");
        console.log(envelope);
        res.status(200).sendFile(distDir+'/index.html');
    }
});

app.get("/api/authenticate", function(req, res) {     
        console.log("Returning user ctxt");
        console.log(req.session.salesforce);
        if(typeof req.session.salesforce == undefined || req.session.salesforce == null || Object.keys(req.session.salesforce).length === 0){
          req.session.salesforce = {
            context : {
              user : {
                fullName : 'Guest User',
                email: 'sample@xyz.com',
                userName: 'Salesforce User Name'
              },
              organization : {
                name : 'Your Company'
              }
            }
          };
        }
        res.status(200).json(req.session.salesforce);
});