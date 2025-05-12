import './style.css'

document.addEventListener('DOMContentLoaded', () => {
  console.log('Hello from Vite!')
  
  // Simple counter functionality
  const counterButton = document.getElementById('counter')
  let count = 0
  
  counterButton.addEventListener('click', () => {
    count++
    counterButton.textContent = `Count is ${count}`
  })
})
