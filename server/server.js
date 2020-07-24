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
const socketDB = 'mongodb://localhost:27017/socket_pool'

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

var userdbConnection = mongoose.createConnection(usersDB, { useNewUrlParser: true, useUnifiedTopology: true })
var socketdbConnection = mongoose.createConnection(socketDB, { useNewUrlParser: true, useUnifiedTopology: true })

var userSchema = mongoose.Schema({
    username: {
        type: String,
        required: true
    }, 
    password: {
        type: String,
        required: true
    }
}, {versionKey: false})
const User = userdbConnection.model('User', userSchema)

var socketSchema = mongoose.Schema({
    socketId: {
        type: String,
        require: true
    },
    client: {
        type: String,
        require: true
    }
})
const Socket = socketdbConnection.model('Socket', socketSchema)

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
        if (err) throw err;

        if(user){
            req.login(user, err => {
                if (err) throw err;
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

app.get('/chat', async (req, res) => {
    if(req.isAuthenticated()){
        var connectedUsers = await Socket.find()
        
        connectedUsers = connectedUsers.map(userSocket => {
            return userSocket.client
        })

        res.render('pages/chat', {
            user: req.user.username,
            connectedUsers: connectedUsers
        })
    }else{
        res.redirect('/login')
    }
})


var eventSocket = io.of('/chat')
eventSocket.on('connection', async (socket) => {    
    console.log(`user '${socket.request.user.username}' connected`)
    socket.broadcast.emit('user-connect', {
        username: socket.request.user.username
    })

    await Socket.create({
        socketId: socket.id,
        client: socket.request.user.username
    })

    socket.on('public-message', data => {
        socket.broadcast.emit('public-message-send', {
            from: socket.request.user.username,
            to: data.to,
            message: data.message
        })
    })

    socket.on('private-message', async (data) => {
        console.log('server: revcieved priv mesg')
        var recipient = await Socket.findOne({client: data.to})
        console.log(recipient)

        //this doesnt work, maybe going to wrong socketid
        socket.broadcast.to(recipient.socketId).emit('private-message-send', {
            from: socket.request.user.username,
            message: data.message
        })
    })

    socket.on('disconnect', async () => {
        await Socket.findOneAndDelete({socketId: socket.id})
        console.log(`user '${socket.request.user.username}' disconnected`)
        socket.broadcast.emit('user-disconnect', {username: socket.request.user.username})
    })
})

server.listen(3000, () => {
    console.log('Server running')
})