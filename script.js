const JSON_PATH = 'dm_cards_data.json';
const CSV_PATH = 'dm_cards_data.csv';
const MAX_QUESTIONS = 10;
let cards = [];
let gameState = null;
let timerId = null;
let selectedChoiceId = null;
let currentQuestionIndex = 0;
let todayCard = null;

// Local folder execution: embed JSON data into embedded_cards.js and use it directly.
const EMBEDDED_CARDS_DATA = typeof EMBEDDED_CARDS !== 'undefined' ? EMBEDDED_CARDS : [];

const screenTitle = document.getElementById('screen-title');
const screenQuiz = document.getElementById('screen-quiz');
const screenResult = document.getElementById('screen-result');
const screenGinko = document.getElementById('screen-ginko');
const btnStart = document.getElementById('btn-start');
const btnGinko = document.getElementById('btn-ginko');
const btnGinkoNext = document.getElementById('btn-ginko-next');
const btnGinkoBack = document.getElementById('btn-ginko-back');
const btnQuit = document.getElementById('btn-quit');
const btnSubmit = document.getElementById('btn-submit');
const btnReturnTitle = document.getElementById('btn-return-title');
const todayFlavorText = document.getElementById('today-flavor-text');
const todayFlavorName = document.getElementById('today-flavor-name');
const todayFlavorCode = document.getElementById('today-flavor-code');
const todayFlavorCard = document.getElementById('today-flavor-card');
const ginkoFlavorText = document.getElementById('ginko-flavor-text');
const ginkoFlavorName = document.getElementById('ginko-flavor-name');
const ginkoFlavorCode = document.getElementById('ginko-flavor-code');
const ginkoFlavorCard = document.getElementById('ginko-flavor-card');
const quizNumber = document.getElementById('quiz-number');
const quizTimer = document.getElementById('quiz-timer');
const quizScore = document.getElementById('quiz-score');
const quizQuestionText = document.getElementById('quiz-question-text');
const choicesGrid = document.getElementById('choices-grid');
const feedbackMessage = document.getElementById('feedback-message');
const resultList = document.getElementById('result-list');
const resultCorrect = document.getElementById('result-correct');

btnStart.addEventListener('click', () => startGame());
btnGinko.addEventListener('click', () => showScreen('ginko'));
btnGinkoNext.addEventListener('click', () => showGinkoCard());
btnGinkoBack.addEventListener('click', () => showScreen('title'));
btnQuit.addEventListener('click', () => showScreen('title'));
btnSubmit.addEventListener('click', () => submitCurrentAnswer());
btnReturnTitle.addEventListener('click', () => showScreen('title'));

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach((element) => element.classList.remove('active'));
  if (screen === 'title') {
    screenTitle.classList.add('active');
  } else if (screen === 'quiz') {
    screenQuiz.classList.add('active');
  } else if (screen === 'result') {
    screenResult.classList.add('active');
  } else if (screen === 'ginko') {
    screenGinko.classList.add('active');
    showGinkoCard();
  }
  if (screen === 'title') {
    clearQuizTimer();
    resetQuizState();
  }
}

function resetQuizState() {
  selectedChoiceId = null;
  currentQuestionIndex = 0;
  gameState = null;
  feedbackMessage.textContent = '';
  btnSubmit.disabled = true;
  btnSubmit.classList.add('main-button--disabled');
}

function loadCards() {
  return Promise.resolve(parseJson(EMBEDDED_CARDS_DATA));
}

function loadCardsFromCsv() {
  return fetch(CSV_PATH)
    .then((response) => {
      if (!response.ok) {
        throw new Error('CSV の読み込みに失敗しました');
      }
      return response.text();
    })
    .then(parseCsv)
    .catch((error) => {
      console.warn('fetch で読み込めませんでした。XMLHttpRequest を試します。', error);
      return xhrLoadCsv();
    });
}

function xhrLoadCsv() {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', CSV_PATH);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        resolve(parseCsv(xhr.responseText));
      } else {
        console.error('XMLHttpRequest で CSV を読み込めませんでした', xhr.status);
        resolve([]);
      }
    };
    xhr.onerror = () => {
      console.error('XMLHttpRequest でエラーが発生しました');
      resolve([]);
    };
    xhr.send();
  });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  const data = [];
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length >= 4) {
      data.push({
        name: fields[0].trim(),
        code: fields[1].trim(),
        image: fields[2].trim(),
        flavor: fields[3].trim(),
      });
    }
  }
  return data;
}

function parseJson(jsonData) {
  if (!Array.isArray(jsonData)) {
    return [];
  }
  return jsonData
    .filter((item) => item && item['カード名'] && item['型番'] && item['画像ファイル名'] && item['フレーバー'])
    .map((item) => ({
      name: item['カード名'].trim(),
      code: item['型番'].trim(),
      image: item['画像ファイル名'].trim(),
      flavor: item['フレーバー'].trim(),
    }));
}

function parseCsvLine(line) {
  const result = [];
  let buffer = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buffer += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  result.push(buffer);
  return result;
}

function populateTodayFlavor() {
  if (!cards.length) {
    todayFlavorText.textContent = 'カードデータを読み込めませんでした。';
    todayFlavorName.textContent = '';
    todayFlavorCode.textContent = '';
    todayFlavorCard.style.setProperty('--flavor-background', 'none');
    return;
  }

  const indexValue = getScatteredValueFromDate(new Date());
  const normalized = Number.isInteger(indexValue) ? ((indexValue - 1 + cards.length) % cards.length) : 0;
  todayCard = cards[normalized];
  displayFlavorCard(todayFlavorCard, todayFlavorText, todayFlavorName, todayFlavorCode, todayCard);
}

function displayFlavorCard(cardContainer, textNode, nameNode, codeNode, card) {
  textNode.textContent = card.flavor;
  nameNode.textContent = card.name;
  codeNode.textContent = `(${card.code})`;
  const imagePath = `images/${encodeURIComponent(card.image)}`;
  cardContainer.style.setProperty('--flavor-background', `url('${imagePath}')`);
}

function showGinkoCard() {
  if (!cards.length) {
    ginkoFlavorText.textContent = 'カードデータを読み込めませんでした。';
    return;
  }
  const randomIndex = Math.floor(Math.random() * cards.length);
  const card = cards[randomIndex];
  displayFlavorCard(ginkoFlavorCard, ginkoFlavorText, ginkoFlavorName, ginkoFlavorCode, card);
}

function startGame() {
  if (!cards.length) {
    return;
  }
  gameState = {
    questions: generateQuestions(),
    score: 0,
    answers: [],
  };
  currentQuestionIndex = 0;
  selectedChoiceId = null;
  feedbackMessage.textContent = '';
  showScreen('quiz');
  renderQuizQuestion();
  startQuizTimer();
}

function generateQuestions() {
  const questionCards = [...cards];
  shuffleArray(questionCards);
  return questionCards.slice(0, MAX_QUESTIONS).map((card) => ({
    answer: card,
    choices: makeChoices(card),
    hasAnswered: false,
  }));
}

function makeChoices(answerCard) {
  const answerIndex = cards.findIndex(card => card.name === answerCard.name && card.code === answerCard.code);
  const minIndex = Math.max(0, answerIndex - 50);
  const maxIndex = Math.min(cards.length - 1, answerIndex + 50);
  const nearbyCards = cards.slice(minIndex, maxIndex + 1).filter(card => card !== answerCard);

  let choices = [answerCard];
  if (nearbyCards.length >= 3) {
    shuffleArray(nearbyCards);
    choices.push(...nearbyCards.slice(0, 3));
  } else {
    // Fallback to original method if not enough nearby cards
    const others = cards.filter((card) => card !== answerCard);
    shuffleArray(others);
    for (let i = 0; i < 3 && i < others.length; i += 1) {
      choices.push(others[i]);
    }
  }
  shuffleArray(choices);
  return choices;
}

function renderQuizQuestion() {
  const question = gameState.questions[currentQuestionIndex];
  quizNumber.textContent = `${currentQuestionIndex + 1}`;
  quizScore.textContent = `${gameState.score}`;
  selectedChoiceId = null;
  btnSubmit.disabled = true;
  btnSubmit.classList.add('main-button--disabled');
  choicesGrid.innerHTML = '';

  quizQuestionText.textContent = maskCardName(question.answer.flavor, question.answer.name);

  question.choices.forEach((choice, index) => {
    const choiceCard = document.createElement('button');
    choiceCard.type = 'button';
    choiceCard.className = 'choice-item';
    choiceCard.dataset.choiceIndex = index;
    choiceCard.addEventListener('click', () => selectChoice(index));

    const choiceImage = document.createElement('img');
    choiceImage.className = 'choice-image';
    choiceImage.alt = choice.name;
    choiceImage.src = `images/${encodeURIComponent(choice.image)}`;

    const choiceDetails = document.createElement('div');
    choiceDetails.className = 'choice-details';

    const choiceName = document.createElement('div');
    choiceName.className = 'choice-name';
    choiceName.textContent = choice.name;

    const choiceCode = document.createElement('div');
    choiceCode.className = 'choice-code';
    choiceCode.textContent = `(${choice.code})`;

    choiceDetails.appendChild(choiceName);
    choiceDetails.appendChild(choiceCode);
    choiceCard.appendChild(choiceImage);
    choiceCard.appendChild(choiceDetails);
    choicesGrid.appendChild(choiceCard);
  });
}

function selectChoice(index) {
  selectedChoiceId = index;
  choicesGrid.querySelectorAll('.choice-item').forEach((element) => {
    element.classList.toggle('selected', Number(element.dataset.choiceIndex) === index);
  });
  btnSubmit.disabled = false;
  btnSubmit.classList.remove('main-button--disabled');
}

function submitCurrentAnswer() {
  if (selectedChoiceId == null) {
    return;
  }
  processAnswer(false);
}

function processAnswer(isTimeout) {
  clearQuizTimer();
  const question = gameState.questions[currentQuestionIndex];
  const selected = isTimeout ? null : question.choices[selectedChoiceId];
  selectedChoiceId = null; // Prevent multiple submissions during feedback display
  const correct = question.answer;
  const isCorrect = selected && selected.name === correct.name && selected.code === correct.code;

  if (isCorrect) {
    gameState.score += 1;
    feedbackMessage.textContent = '正解！';
    feedbackMessage.classList.remove('incorrect');
    feedbackMessage.classList.add('correct');
  } else {
    feedbackMessage.textContent = `不正解！\n正解は《${correct.name}》(${correct.code})`;
    feedbackMessage.classList.remove('correct');
    feedbackMessage.classList.add('incorrect');
  }
  feedbackMessage.classList.add('visible');

  gameState.answers.push({
    question: question.answer,
    selected: selected,
    correct: correct,
    isCorrect,
  });

  setTimeout(() => {
    feedbackMessage.textContent = '';
    feedbackMessage.classList.remove('visible', 'correct', 'incorrect');
    currentQuestionIndex += 1;
    if (currentQuestionIndex >= MAX_QUESTIONS) {
      showResult();
    } else {
      renderQuizQuestion();
      startQuizTimer();
    }
  }, 1000);
}

function startQuizTimer() {
  let seconds = 30;
  quizTimer.textContent = `${seconds}`;
  clearQuizTimer();
  timerId = setInterval(() => {
    seconds -= 1;
    quizTimer.textContent = `${seconds}`;
    if (seconds <= 0) {
      processAnswer(true);
    }
  }, 1000);
}

function clearQuizTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function showResult() {
  btnSubmit.disabled = true;
  btnSubmit.classList.add('main-button--disabled');
  resultCorrect.textContent = gameState.score;
  resultList.innerHTML = '';
  gameState.answers.forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.style.setProperty('--flavor-background', `url('images/${encodeURIComponent(entry.question.image)}')`);

    const entryBox = document.createElement('div');
    entryBox.className = 'result-entry';

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.innerHTML = `<span>第${index + 1}問</span><span class="result-status ${entry.isCorrect ? '' : 'incorrect'}">${entry.isCorrect ? '正解' : '不正解'}</span>`;

    const flavorText = document.createElement('div');
    flavorText.className = 'question-text';
    flavorText.textContent = entry.question.flavor;

    const footer = document.createElement('div');
    footer.className = 'flavor-card__footer';
    const name = document.createElement('div');
    name.className = 'flavor-card__name';
    name.textContent = entry.question.name;
    const code = document.createElement('div');
    code.className = 'flavor-card__code';
    code.textContent = `(${entry.question.code})`;
    footer.appendChild(name);
    footer.appendChild(code);

    entryBox.appendChild(meta);
    entryBox.appendChild(flavorText);
    entryBox.appendChild(footer);
    item.appendChild(entryBox);
    resultList.appendChild(item);
  });

  showScreen('result');
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function initApp() {
  loadCards().then((loaded) => {
    cards = loaded;
    populateTodayFlavor();
    if (!cards.length) {
      todayFlavorText.textContent = 'カードデータの読み込みに失敗しました。';
    }
  });
  showScreen('title');
}

function getScatteredValueFromDate(date) {
  // TODO: ここに実装を入れてください
  const yyyymmdd = date.getFullYear().toString() +
                   (date.getMonth() + 1).toString().padStart(2, '0') +
                   date.getDate().toString().padStart(2, '0');
  let hash = 0;
  for (let i = 0; i < yyyymmdd.length; i += 1) {
    const char = yyyymmdd.charCodeAt(i);
    hash = ((hash << 5) + hash) + char;
    hash |= 0;
  }
  return (Math.abs(hash) % 12568) + 1;
}

initApp();
function maskCardName(flavor, cardName) {
  if (!flavor || !cardName) return flavor;
  // 正規表現でカード名を検索（エスケープ処理付き）
  const escapedName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedName, 'g');
  return flavor.replace(regex, '？？？？？');
}