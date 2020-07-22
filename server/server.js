var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')

var express = require('express')
var session = require('express-session')
var bcrypt = require('bcrypt')

var app = express()
var server = require('http').Server(app)
var socketio = require('socket.io')
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy
var passportSocket = require('passport.socketio')

const sessionDB = 'mongodb://localhost:27017/sessions_db'
const usersDB = 'mongodb://localhost:27017/users_db'

var mongoose = require('mongoose')
var MongoStore = require('connect-mongo')(session)
var sessionStorage = new MongoStore({url: sessionDB})

var io = socketio(server)
io.use(passportSocket.authorize({
    key: 'connect.sid',
    secret: 'x-marks-the-spot',
    store: sessionStorage,
    passport: passport,
    cookieParser: cookieParser
}))

app.set('view engine', 'ejs')

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))
app.use(session({
    store: sessionStorage,
    resave: false,
    saveUninitialized: false,
    secret: 'x-marks-the-spot'
}))

mongoose.connect(usersDB, { useNewUrlParser: true, useUnifiedTopology: true })

var schema = mongoose.Schema({
    username: {
        type: String,
        required: true
    }, 
    password: {
        type: String,
        required: true
    }
}, {versionKey: false})

const User = mongoose.model('User', schema)

passport.use(new LocalStrategy({username: 'username', password: 'password'},
    async (username, password, next) => {
        console.log(username)
        user = await User.findOne({username: username})
        if(user && await bcrypt.compare(password, user.password)){
            next(null, user)
        }else{
            next(null, false)
        }
    }
))

passport.serializeUser((user, next) => {
    next(null, user._id)
})

passport.deserializeUser(async (id, next) => {
    var user = await User.findOne({_id: id})
    user ? next(null, user) : next(null, false)
})

app.use(passport.initialize())
app.use(passport.session())

/* ROUTES --------------------------------------------- */
app.get('/', (req, res) => {
    if(req.isAuthenticated()){
        res.render('pages/index')
    }else{
        res.redirect('/login')
    }
    res.end()
})

app.post('/', (req, res) => {
    if(req.isAuthenticated()){
        console.log('POST to /')
    }else{
        res.redirect('/login')
    }
})

app.get('/login', (req, res) => {
    if(req.isAuthenticated()){
        res.redirect('/')
    }else{
        res.render('pages/login', {
            errorMessage: `Please enter your log in information.`,
            color: 'auto'
        })
    }
})

app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user) => {
        if(err){ throw err }
        if(user){
            req.login(user, err => {
                console.log('logging in')
                if(err){ throw err }
                
                res.redirect('/')
            })
        }else{
            res.render('pages/login', {
                errorMessage: `Username or password incorrect!`,
                color: 'red'
            })
        }
    })(req, res, next)
})

app.get('/signup', (req, res) => {
    if(req.isAuthenticated()){
        res.redirect('/')
    }else{
        res.render('pages/signup', {
            errorMessage: 'Create your account!',
            color: 'auto'
        })
    }
})

app.post('/signup', async (req, res) => {
    const trimmedUsername = req.body.username.trim()
    const trimmedPassword = req.body.password.trim()

    const users = await User.find({username: trimmedUsername})

    if(users.length === 0){
        const hashedPassword = await bcrypt.hash(trimmedPassword, 10)
        await User.create({
            username: trimmedUsername,
            password: hashedPassword
        })
        res.redirect('/login')
    }else{
        res.render('pages/signup', {
            errorMessage: 'Sorry, that username already exists!',
            color: 'red'
        })
    }
})

app.get('/logout', (req, res) => {
    req.session.destroy()
    res.redirect('/login')
})

app.get('/chat', (req, res) => {
    if(req.isAuthenticated()){
        res.render('pages/chat', {
            user: req.user.username
        })
    }else{
        res.redirect('/login')
    }
})


var eventSocket = io.of('/chat')
eventSocket.on('connection', socket => {    
    console.log(`user '${socket.request.user.username}' connected`)

    socket.on('message-send', data => {
        //this makes it to client, append to client messages
        socket.emit('message', {
            from: socket.request.user.username,
            to: data.to,
            message: data.message
        })
    })
})

server.listen(3000, () => {
    console.log('Server running')
})