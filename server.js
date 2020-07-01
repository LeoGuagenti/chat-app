const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)

app.use(express.static(__dirname))

app.get('/', (req, res) => {
    res.sendFile('index.html')
    res.end()
})

io.on('connection', socket => {
        console.log(`${socket.id} connected.`);
        socket.broadcast.emit('connect-message', socket.id)

        socket.on('send-chat-message', message => {
            console.log(`${socket.id} sent a message`)
            socket.broadcast.emit('chat-message', message, socket.id)
        })

        socket.on('disconnect', () => {
            socket.broadcast.emit('disconnect-message', socket.id)
            console.log(`${socket.id} disconnected`)
        })
});


server.listen(3000, () => {
    console.log('Server listening on port 3000')
})