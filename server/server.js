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

const db = 'mongodb://localhost:27017/chatapp_db'

var mongoose = require('mongoose')
var MongoStore = require('connect-mongo')(session)
var sessionStorage = new MongoStore({url: db})

var dbConnection = mongoose.createConnection(db, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
})

const User = dbConnection.model('User', mongoose.Schema({
    username: {
        type: String,
        required: true
    }, 
    password: {
        type: String,
        required: true
    }
}, {
    versionKey: false,
    collection: 'users'
}))

const Message = dbConnection.model('Message', mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    from: {
        type: String,
        required: true
    },
    timeStamp: {
        type: String,
        required: false
    }
}, {
    collection: 'messages'
}))

const Socket = dbConnection.model('Socket', mongoose.Schema({
    socketId: {
        type: String,
        require: true
    },
    client: {
        type: String,
        require: true
    }
}, {
    collection: 'sockets'
}))

passport.use(new LocalStrategy({username: 'username', password: 'password'},
    async (username, password, next) => {
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
    secret: 'x-marks-the-spot',
    maxAge: new Date(Date.now() + 60000) // 1 min
}))
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

const messsageLimit = 20;
var eventSocket = io.of('/chat')
eventSocket.on('connection', async (socket) => {    

    console.log(`user '${socket.request.user.username}' connected`)
    socket.broadcast.emit('user-connect', {
        username: socket.request.user.username
    })

    //send last 10 messages to client on connection
    Message.find().sort('-1').limit(messsageLimit).exec((err, messages) => {
        socket.emit('initial-messages', { messages: messages, you: socket.request.user.username })
    })

    await Socket.create({
        socketId: socket.id,
        client: socket.request.user.username
    })

    socket.on('public-message', (data) => {
        if(data.message.trim() != ""){
            Message.countDocuments({}, async (err, count) => {
                if (err) throw err;

                if(count >= messsageLimit){
                    await Message.deleteOne()
                }

                await Message.create({
                    from: socket.request.user.username,
                    content: data.message.trim(),
                    timeStamp: `${Date.now()}`
                })

                //sending to this.socket
                socket.emit('global-message', {
                    from: '(You)',
                    message: data.message,
                    color: 'blue'
                })

                //sending to public clients
                socket.broadcast.emit('global-message', {
                    from: `[${socket.request.user.username}]`,
                    message: data.message,
                    color: 'black'
                })
            })
        }
    })

    socket.on('private-message', async (data) => {
        var to = await Socket.findOne({client: data.to})

        //sending to this.socket 
        socket.emit('direct-message', {
            from: `(You → ${data.to})`,
            message: data.message,
            color: 'purple'
        })

        //sending to specified socket
        socket.broadcast.to(to.socketId).emit('direct-message', {
            from: `(${socket.request.user.username} → You)`,
            message: data.message,
            color: 'purple'
        })
    })

    socket.on('disconnect', async () => {
        console.log(`user '${socket.request.user.username}' disconnected`)
        
        await Socket.findOneAndDelete({socketId: socket.id})
        socket.broadcast.emit('user-disconnect', {username: socket.request.user.username})
    })
})

server.listen(3000, () => {
    console.log('~Server running')
})

/* 
    TODO LIST 
    + fix/resolve session storage bugs
    + session expirations
    + fix jumpBottom error - not working on message send
*/

