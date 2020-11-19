//jshint esversion:6
require("dotenv").config();
const express = require('express');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const PushNotifications = require('@pusher/push-notifications-server');
 
let pushNotifications = new PushNotifications({
  instanceId: process.env.PUSHER_INSTANCE_ID,
  secretKey: process.env.PUSHER_SECRET_KEY
});



mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));


app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());




mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true })
.then(() => console.log("Mongo connection success..."));



const userSchema = new mongoose.Schema({

  username: String,
  password: String,
  secret: String,
  googleId: String,
  facebookId: String

});

userSchema.plugin(passportLocalMongoose, { usernameUnique: false });
userSchema.plugin(findOrCreate);



const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());



// use static serialize and deserialize of model for passport session support
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://secret-app-push-notification.herokuapp.com/auth/google/secrets",
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},
  function (accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));


passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  callbackURL: "https://secret-app-push-notification.herokuapp.com/auth/facebook/secrets"
},
  function (accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));




app.get("/", function (req, res) {
  res.render("home");
});

app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/secrets",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {

    res.redirect("/secrets");
  });

app.get("/auth/facebook",
  passport.authenticate("facebook"));

app.get("/auth/facebook/secrets",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  function (req, res) {

    res.redirect("/secrets");
  });


app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/login");
});

app.get("/register", function (req, res) {
  res.render("register");
});



app.get("/secrets", function (req, res) {

  User.find({ secret: { $ne: null } }, function (err, foundUsers) {
    if (err) {
      console.log(err);

    } else {
      if (foundUsers) {
        res.render("secrets", { usersWithSecrets: foundUsers });

      }
    }
  })


});



app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

app.post("/submit", function (req, res) {
  User.findById(req.user._id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {

        foundUser.secret = req.body.secret;

        foundUser.save(function (err ,user) {
          pushNotifications.publishToInterests(['secret'], {
            web: {
              notification: {
                title: 'New Secret published',
                body: `${user.username} has been posted a new secret, check it out now!`,
                deep_link: 'https://secret-app-push-notification.herokuapp.com/secrets',
              }
            },
            apns: {
              aps: {
                alert: 'New Secret published!'
              }
            },
            fcm: {
              notification: {
                title: 'New Secret published',
                body: `${user.username}`,
                deep_link: 'https://www.usamav.dev'
              }
            }
          }).then((publishResponse) => {
            console.log('Just published:', publishResponse.publishId);
          })
          .catch((error) => {
            console.log('Error:', error);
          });
          
          res.redirect("/secrets");
        });

      } else {
        res.redirect("/login");
      }
    }
  })


})



app.post("/register", function (req, res) {
  User.register({ username: req.body.username }, req.body.password, function (err, user) {
    if (err) {
      res.send(err.message);
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/secrets");
      });
    }
  });



});


app.post("/login", function (req, res) {

  const user = new User({
    username: req.body.username,
    password: req.body.password
  });
  req.login(user, function (err) {
    if (err) {
      res.send(err);
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/secrets");
      });
    }
  });
})

const port = 5000 || process.env.PORT;
app.listen(port , () => console.log(`port ${port} started`));

