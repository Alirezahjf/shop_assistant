// popup.js - نسخه حرفه‌ای و تمیز

const permissionSection = document.getElementById('permission-section');
const loadingSection = document.getElementById('loading-section');
const chatSection = document.getElementById('chat-section');
const errorSection = document.getElementById('error-section');
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const startBtn = document.getElementById('start-btn');
const sendBtn = document.getElementById('send-btn');
const retryBtn = document.getElementById('retry-btn');
const errorMessage = document.getElementById('error-message');

function showSection(section) {
  [permissionSection, loadingSection, chatSection, errorSection].forEach(s => s.classList.add('hidden'));
  section.classList.remove('hidden');
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:inherit;text-decoration:underline;">$1</a>');
}

function addMessage(rawText, isUser = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;

  if (isUser) {
    messageDiv.textContent = rawText;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  // جدا کردن متن و محصولات
  const productRegex = /\[PRODUCT\][\s\S]*?\[\/PRODUCT\]/g;
  const cleanText = rawText.replace(productRegex, '').trim();
  const productMatches = rawText.match(productRegex) || [];

  // نمایش متن
  if (cleanText) {
    const textNode = document.createElement('div');
    textNode.innerHTML = linkify(cleanText);
    messageDiv.appendChild(textNode);
  }

  // نمایش کارت‌های محصول
  productMatches.forEach(match => {
    const jsonStr = match.replace(/\[PRODUCT\]/g, '').replace(/\[\/PRODUCT\]/g, '').trim();
    try {
      const data = JSON.parse(jsonStr);
      messageDiv.appendChild(createProductCard(data));
    } catch (e) {
      console.error('خطا در پارس محصول:', e);
    }
  });

  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function createProductCard(data) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-image';
  if (data.image && data.image.trim()) {
    imageDiv.style.backgroundImage = `url(${data.image})`;
  } else {
    imageDiv.innerHTML = '<div style="font-size:2.5rem;opacity:0.3;">🛍️</div>';
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'product-info';

  const title = document.createElement('div');
  title.className = 'product-title';
  title.textContent = data.name || 'محصول پیشنهادی';

  const summary = document.createElement('p');
  summary.className = 'product-summary';
  summary.textContent = data.summary || 'توضیحات موجود نیست.';

  const link = document.createElement('a');
  link.className = 'product-link';
  link.href = data.link || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'مشاهده در دیجی‌کالا';

  infoDiv.append(title, summary, link);
  card.append(imageDiv, infoDiv);
  return card;
}

function toggleInput(enable) {
  userInput.disabled = !enable;
  sendBtn.disabled = !enable;
  if (enable) userInput.focus();
}

async function requestPermissionsAndAnalyze() {
  showSection(loadingSection);
  try {
    const granted = await chrome.permissions.request({
      permissions: ['history', 'cookies'],
      origins: ['http://5.9.166.254/*']
    });
    if (granted) await startAnalysisAndChat();
    else throw new Error('دسترسی رد شد.');
  } catch (error) {
    displayError(`خطا: ${error.message}`);
  }
}

async function startAnalysisAndChat() {
  showSection(loadingSection);
  try {
    const response = await chrome.runtime.sendMessage({ action: 'analyze_and_chat' });
    if (response.success) {
      showSection(chatSection);
      addMessage(response.aiResponse, false);
      toggleInput(true);
    } else throw new Error(response.error);
  } catch (error) {
    displayError(`خطا در تحلیل: ${error.message}`);
  }
}

async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  addMessage(message, true);
  userInput.value = '';
  toggleInput(false);

  const typing = createTypingIndicator();
  chatBox.appendChild(typing);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'chat_message', message });
    typing.remove();
    if (response.success) addMessage(response.aiResponse, false);
    else throw new Error(response.error);
  } catch (error) {
    typing.remove();
    addMessage(`خطا: ${error.message}`, false);
  } finally {
    toggleInput(true);
  }
}

function createTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message ai-message typing-indicator';
  div.innerHTML = '<span>.</span><span>.</span><span>.</span>';
  return div;
}

function displayError(msg) {
  errorMessage.textContent = msg;
  showSection(errorSection);
  toggleInput(false);
}

async function checkInitialState() {
  try {
    const hasPermissions = await chrome.permissions.contains({ permissions: ['history', 'cookies'] });
    if (hasPermissions) await startAnalysisAndChat();
    else showSection(permissionSection);
  } catch (e) {
    displayError(`خطا: ${e.message}`);
  }
}

document.addEventListener('DOMContentLoaded', checkInitialState);
startBtn.addEventListener('click', requestPermissionsAndAnalyze);
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
retryBtn.addEventListener('click', checkInitialState);