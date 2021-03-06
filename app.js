/**
 * Copyright (c) Microsoft Corporation
 *  All Rights Reserved
 *  MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the 'Software'), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
 * OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

/******************************************************************************
 * Module dependencies.
 *****************************************************************************/

var express = require('express');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var passport = require('passport');
var util = require('util');
var bunyan = require('bunyan');
var config = require('./config');


// Start QuickStart here

var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
var OIDCBearerStrategy = require('passport-azure-ad').BearerStrategy;

var log = bunyan.createLogger({
    name: 'Microsoft OIDC Example Web Application'
});

/******************************************************************************
 * Set up passport in the app 
 ******************************************************************************/

//-----------------------------------------------------------------------------
// To support persistent login sessions, Passport needs to be able to
// serialize users into and deserialize users out of the session.  Typically,
// this will be as simple as storing the user ID when serializing, and finding
// the user by ID when deserializing.
//-----------------------------------------------------------------------------

passport.serializeUser(function(user, done) {
  done(null, user.oid);
});

passport.deserializeUser(function(oid, done) {
  findByOid(oid, function (err, user) {
    done(err, user);
  });
});

// array to hold logged in users
var users = [];

var findByOid = function(oid, fn) {
  for (var i = 0, len = users.length; i < len; i++) {
    var user = users[i];
   log.info('we are using user: ', user);
    if (user.oid === oid) {
      return fn(null, user);
    }
  }
  return fn(null, null);
};

//-----------------------------------------------------------------------------
// Use the OIDCStrategy within Passport.
// 
// Strategies in passport require a `verify` function, which accepts credentials
// (in this case, the `oid` claim in id_token), and invoke a callback to find
// the corresponding user object.
// 
// The following are the accepted prototypes for the `verify` function
// (1) function(iss, sub, done)
// (2) function(iss, sub, profile, done)
// (3) function(iss, sub, profile, access_token, refresh_token, done)
// (4) function(iss, sub, profile, access_token, refresh_token, params, done)
// (5) function(iss, sub, profile, jwtClaims, access_token, refresh_token, params, done)
// (6) prototype (1)-(5) with an additional `req` parameter as the first parameter
//
// To do prototype (6), passReqToCallback must be set to true in the config.
//-----------------------------------------------------------------------------
passport.use(new OIDCStrategy({
    identityMetadata: config.creds.identityMetadata,
    clientID: config.creds.clientID,
    responseType: config.creds.responseType,
    responseMode: config.creds.responseMode,
    redirectUrl: config.creds.redirectUrl,
    allowHttpForRedirectUrl: config.creds.allowHttpForRedirectUrl,
    clientSecret: config.creds.clientSecret,
    validateIssuer: config.creds.validateIssuer,
    isB2C: config.creds.isB2C,
    issuer: config.creds.issuer,
    passReqToCallback: config.creds.passReqToCallback,
    scope: config.creds.scope,
    loggingLevel: config.creds.loggingLevel,
    nonceLifetime: config.creds.nonceLifetime,
    nonceMaxAmount: config.creds.nonceMaxAmount,
    useCookieInsteadOfSession: config.creds.useCookieInsteadOfSession,
    cookieEncryptionKeys: config.creds.cookieEncryptionKeys,
    clockSkew: config.creds.clockSkew,
  },
  function(iss, sub, profile, accessToken, refreshToken, done) {
    if (!profile.oid) {
      return done(new Error("No oid found"), null);
    }
    // asynchronous verification, for effect...
    process.nextTick(function () {
      findByOid(profile.oid, function(err, user) {
        if (err) {
          return done(err);
        }
        if (!user) {
          // "Auto-registration"
          users.push(profile);
          return done(null, accessToken);
        }
        return done(null, accessToken);
      });
    });
  }
));

var options = {
  // The URL of the metadata document for your app. We will put the keys for token validation from the URL found in the jwks_uri tag of the in the metadata.
  identityMetadata: config.creds.identityMetadata,
  clientID: config.creds.clientID,
  validateIssuer: config.creds.validateIssuer,
  issuer: config.creds.issuer,
  passReqToCallback: config.creds.passReqToCallback,
  isB2C: config.creds.isB2C,
  policyName: config.creds.policyName,
  allowMultiAudiencesInToken: config.creds.allowMultiAudiencesInToken,
  audience: config.creds.audience,
  loggingLevel: config.creds.loggingLevel,
};

var bearerStrategy = new OIDCBearerStrategy(options,
  function(token, done) {
      log.info(token, 'was the token retreived');
      if (!token.oid)
          done(new Error('oid is not found in token'));
      else {
          owner = token.oid;
          done(null, token);
      }
  }
);

passport.use(bearerStrategy);

//-----------------------------------------------------------------------------
// Config the app, include middlewares
//-----------------------------------------------------------------------------
var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.logger());
app.use(methodOverride());
app.use(cookieParser());




var pgSession = require('connect-pg-simple')(expressSession);
app.use(expressSession({
    store: new pgSession({
        conString : process.env.DATABASE_URL
     }),
     secret: 'mysessionsecret',
     resave: false,
     cookie: {
         maxAge: 7 * 24 * 60 * 60 * 1000
     },
     secure : true
 }));


app.use(bodyParser.urlencoded({ extended : true }));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use(express.static(__dirname + '/../../public'));

//-----------------------------------------------------------------------------
// Set up the route controller
//
// 1. For 'login' route and 'returnURL' route, use `passport.authenticate`. 
// This way the passport middleware can redirect the user to login page, receive
// id_token etc from returnURL.
//
// 2. For the routes you want to check if user is already logged in, use 
// `ensureAuthenticated`. It checks if there is an user stored in session, if not
// it will call `passport.authenticate` to ask for user to log in.
//-----------------------------------------------------------------------------
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
};

app.get('/', function(req, res) {
  res.render('index', { user: req.user });
});

// '/account' is only available to logged in user
app.get('/account', ensureAuthenticated, function(req, res) {
  res.render('account', { user: req.user });
});

app.get('/login',
  function(req, res, next) {
    passport.authenticate('azuread-openidconnect', 
      { 
        response: res,                      // required
        resourceURL: config.resourceURL,    // optional. Provide a value if you want to specify the resource.
        customState: 'my_state',            // optional. Provide a value if you want to provide custom state value.
        failureRedirect: '/' 
      }
    )(req, res, next);
  },
  function(req, res) {
    log.info('Login was called in the Sample');
    res.redirect('/');
});

// 'GET returnURL'
// `passport.authenticate` will try to authenticate the content returned in
// query (such as authorization code). If authentication fails, user will be
// redirected to '/' (home page); otherwise, it passes to the next middleware.
app.get('/auth/openid/return',
  function(req, res, next) {
    passport.authenticate('azuread-openidconnect', 
      { 
        response: res,                      // required
        failureRedirect: '/',
        responseType: 'id_token'  
      }
    )(req, res, next);
  },
  function(req, res) {
    log.info('We received a return from AzureAD.');
  });

// 'POST returnURL'
// `passport.authenticate` will try to authenticate the content returned in
// body (such as authorization code). If authentication fails, user will be
// redirected to '/' (home page); otherwise, it passes to the next middleware.
app.post('/auth/openid/return',
  function(req, res, next) {
  
    passport.authenticate('azuread-openidconnect', 
      { 
        response: res,                      // required
        failureRedirect: '/',
        responseType: 'id_token'
      }
    )(req, res, next);
  },
  function(req, res) {
    log.info('We received a return from AzureAD.');
  });

// 'logout' route, logout from passport, and destroy the session with AAD.
app.get('/logout', function(req, res){
  req.session.destroy(function(err) {
    req.logOut();
    res.redirect(config.destroySessionUrl);
  });
});

// API aut?



app.get('/api/search',  passport.authenticate('oauth-bearer', {session: false}), function(req, res) {
  var q = req.query.q;
  const rp = require("request-promise");
  if (q) {

    const options = {
      method: "GET",
      uri: config.searchURI,
      qs: {
          access_token  : config.coveoSecret,
          excerptLength : config.excerptLength,
          q             : q
      },
      headers: {
          'User-Agent': 'Request-Promise'
      },
      json: false 
    };

    rp(options).then(function (r) {
        const parsedUrl = r ? JSON.parse(r) : {};
        res.json(parsedUrl);
    });

  } else {
    res.json({"status": "error", "Error Message": "q was not passed"})
  }
});


app.get('/api/suggest',  passport.authenticate('oauth-bearer', { session: false}), function(req, res) {
  var q = req.query.q;
  const rp = require("request-promise");
  if (q) {

    const options = {
      method: "GET",
      uri: config.suggestionURI,
      qs: {
          access_token  : config.coveoSecret,
          excerptLength : config.excerptLength,
          q             : q
      },
      headers: {
          'User-Agent': 'Request-Promise'
      },
      json: false 
    };

    rp(options).then(function (r) {
        const parsedUrl = r ? JSON.parse(r) : {};
        res.json(parsedUrl);
    });

  } else {
    res.json({"status": "error", "Error Message": "q was not passed"})
  }
});


app.get('/api/search-complete',  passport.authenticate('oauth-bearer', {session: false}), function(req, res) {
  var uniqueId = req.query.uniqueId;
  const rp = require("request-promise");
  if (uniqueId) {

    const options = {
      method: "GET",
      uri: config.searchCompleteResultURI,
      qs: {
          access_token  : config.coveoSecret,
          uniqueId      : uniqueId
      },
      headers: {
          'User-Agent': 'Request-Promise'
      },
      json: false 
    };

    rp(options).then(function (r) {
        res.render(r);
    });

  } else {
    res.json({"status": "error", "Error Message": "invalid uniqid"})
  }
});



app.listen(process.env.PORT || 3000);

