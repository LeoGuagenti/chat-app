var socket = io.connect('http://localhost:3000')

var messageForm = document.getElementById('message-form')
var messageInput = document.getElementById('message-input')
var messageContainer = document.getElementById('message-container')

var newElment = (type, data) => { 
    const element = document.createElement(type)
    element.id = "chat-message"
    element.innerHTML = data
    return element
}

var scrollToBottom = () => {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

messageForm.addEventListener('submit', event => {
    event.preventDefault();
    const message = messageInput.value
    if(message != ""){
        socket.emit('send-chat-message', message)
        messageInput.value = ""

        const messageElement = newElment('div', `(You): ${message}`)
        messageContainer.append(messageElement)
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }
})

socket.on('chat-message', (message, userId) => {
    console.log(`${userId}> ${message}`)
    const messageElement = newElment('div', `${userId}: ${message}`)
    messageContainer.append(messageElement)
    messageContainer.scrollTop = messageContainer.scrollHeight;
})

socket.on('connect-message', data => {
    const messageElement = newElment('div', `${data} has connected`)
    messageContainer.append(messageElement)
    messageContainer.scrollTop = messageContainer.scrollHeight;
})

socket.on('disconnect-message', data => {
    const messageElement = newElment('div', `${data} has disconnected`)
    messageContainer.append(messageElement)
    messageContainer.scrollTop = messageContainer.scrollHeight;
})