// ============================================================
//  REVERSE  (c)ASAEDA
//  Processing (Java) 版から p5.js へ移植
//  画像・音声は data/ フォルダに置いてください
// ============================================================

const DATA = "data/";

let scene = -1;
let started = false; // ブラウザは操作前に音を鳴らせないため最初のクリックを待つ

// --- 音 ---
let song1, song2, song3, song4, se, se2, warning;

// --- 画像 ---
let title, titlebg, titlelogo, imgScreen, fukidashi, ranking, imgCursor;
let shacch = [];
let serif = [];

// --- 盤面 ---
let tile = make2D(8, 9); // 0=空 1=黒 2=白
let check = make2D(8, 9);
let space = make2D(8, 9);
let next = new Array(8).fill(0);
let high = new Array(8).fill(0);
let fall = new Array(8).fill(0);
let cursorxy = [430, 350];

let rankName = ["ASA", "KKN", "SRC", "ISU", "WCO", "KKY", "EBI", "KRB", "YJP", "MUR"];
let rankPoint = [10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000];
let playerNameE = [" ", " ", " "];
let playerName = "";

let state = 0; // 0=入力受け付け中 1=落下中
let limit = 300;
let score = 0;
let broken = 0;
let cx = 0;
let cy = 0;
let least = 4; // 繋げなければいけないタイルの最少数
let falling = 0;
let gameover = 0;
let bgroop = 0;
let limitMAX = 300;
let shacchAnm = 0;
let siren = 0;
let dark = [255, 0, 255];
let zoom = 300;
let playerRank = -1;
let pN = 0;
let rankingTime = 0;
let demo = 0;
let input = 0;

// ------------------------------------------------------------
//  読み込み（Processing の setup 内 loadImage は preload に移す）
// ------------------------------------------------------------
function preload() {
  title = img("title.png");
  titlebg = img("REVERSEbg.png");
  titlelogo = img("REVERSElogo.png");
  imgScreen = img("bgsky.jpg");
  fukidashi = img("fukidashi.png");
  ranking = img("ranking.png");
  imgCursor = img("mouse.png");

  for (let i = 0; i < 11; i++) {
    shacch[i] = img(i === 10 ? "shacch_miss.png" : "shacch" + (i + 1) + ".png");
  }
  for (let i = 0; i < 7; i++) {
    serif[i] = img("serif" + (i + 1) + ".png");
  }

  song1 = snd("title.mp3");
  song2 = snd("main.mp3");
  song3 = snd("ranking.mp3");
  song4 = snd("demo.mp3");
  se = snd("sen_ge_hasai02.mp3");
  se2 = snd("miss.mp3");
  warning = snd("Warning-Siren01-1.mp3");
}

function setup() {
  const c = createCanvas(750, 500);
  c.parent("game");
  textFont("sans-serif");
}

// ------------------------------------------------------------
//  draw
// ------------------------------------------------------------
function draw() {
  if (!started) {
    background(20);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(28);
    text("CLICK TO START", width / 2, height / 2);
    textAlign(LEFT, BASELINE);
    return;
  }

  if (scene === -2) { // デモ（遊び方）
    background(255);
    bgroop--;
    score = 0;
    demo++;
    if (bgroop <= -height * 2.589) bgroop = 0;
    di(imgScreen, bgroop, 0, height * 2.589, height);
    di(imgScreen, bgroop + height * 2.589, 0, height * 2.589, height);

    // demoでlimitを管理
    if (demo > 450 && demo <= 550) {
      limit -= 3;
    } else if (demo > 1040 && demo <= 1190) {
      limit -= 6;
    }

    stroke(0);

    // 危険ライン
    siren = 0;
    for (let i = 0; i < 8; i++) {
      if (tile[i][8] >= 1) {
        siren++;
        strokeWeight(2);
        stroke(255, 0, 0);
        fill(230, 46, 86, 120);
        rect(66 + i * 40, -20, 40, 520);
      }
    }
    stroke(0);

    drawGrid();

    // タイル描写
    drawTiles();

    fill(0);
    textSize(30);
    text("NEXT:" + limit, 420, 30);
    strokeWeight(1);
    fill(169, 169, 169, 150);
    rect(420, 50, 300, 40);
    fill(124, 252, 0);
    rect(420, 50, map(limit, 0, limitMAX, 0, 300), 40);
    if (limit <= 0) {
      state = 1;
      limitMAX = 300 - floor(score / 50);
      if (limitMAX < 20) limitMAX = 20;
      limit = limitMAX;
    }

    strokeWeight(1);
    if (state === 0) {
      drawNext();
    } else if (state === 1) {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 9; j++) {
          if (tile[i][j] >= 1 && j > high[i]) {
            if (j === 8) {
              scene = 2;
              se2.play();
            } else {
              high[i] = j;
            }
          }
        }
      }
      for (let i = 0; i < 8; i++) {
        if (high[i] === 0 && tile[i][0] === 0) high[i] = -1;
        tile[i][high[i] + 1] = next[i];
      }
      for (let i = 0; i < 8; i++) {
        next[i] = int(random(1, 3));
        high[i] = 0;
      }
      state = 0;
    }

    drawShacch();

    if (demo > 150 && demo < 240) {
      cursorxy[0] = int(map(demo, 150, 240, 430, 166));
      cursorxy[1] = int(map(demo, 150, 240, 350, 410));
    } else if (demo === 240) {
      treverse(2, 1);
    } else if (demo > 300 && demo < 390) {
      cursorxy[0] = int(map(demo, 300, 390, 166, 346));
      cursorxy[1] = int(map(demo, 300, 390, 410, 370));
    } else if (demo === 390) {
      Btile(2);
    } else if (demo > 690 && demo < 830) {
      cursorxy[0] = int(map(demo, 690, 830, 346, 226));
      cursorxy[1] = int(map(demo, 690, 830, 370, 50));
    } else if (demo === 830) {
      state = 1;
      limit = limitMAX;
    }

    di(imgCursor, cursorxy[0], cursorxy[1]);

    // シャッチ台詞
    if (demo > 60 && demo < 120) {
      di(serif[0], 440, 150, 250, 170);       // あいさつ
    } else if (demo > 150 && demo < 270) {
      di(serif[1], 440, 150, 250, 170);       // 白いタイルの説明
    } else if (demo > 300 && demo < 420) {
      di(serif[2], 440, 150, 250, 170);       // 黒いタイルの説明
    } else if (demo > 450 && demo < 660) {
      di(serif[3], 440, 150, 250, 170);       // タイル落下の説明
    } else if (demo > 690 && demo < 860) {
      di(serif[4], 440, 150, 250, 170);       // タイル自発落下の説明
    } else if (demo > 890 && demo < 1010) {
      di(serif[5], 440, 150, 250, 170);       // 難易度上昇の説明
    } else if (demo > 1040 && demo < 1220) {
      di(serif[6], 440, 150, 250, 170);       // 限界を目指そうの説明
    } else if (demo >= 1220) {
      // ランキングへ
      noStroke();
      fill(0, 0, 0, map(demo, 1160, 1190, 0, 255));
      rect(0, 0, width, height);
      if (demo >= 1270) {
        scene = -1;
        demo = -1;
        reset();
        song4.stop();
        song1.loop();
      }
    }

    if (demo <= 60) {
      noStroke();
      fill(0, 0, 0, map(demo, 0, 60, 255, 0));
      rect(0, 0, width, height);
    }

  } else if (scene === -1) { // OP
    background(255);
    di(titlebg, 0, 0, 750, 500);
    if (dark[0] > 0) {
      noStroke();
      fill(0, 0, 0, dark[0]);
      rect(0, 0, 750, 500);
      dark[0]--;
    } else if (zoom > 0) {
      di(titlelogo, -zoom, -zoom, 750 + zoom * 2, 500 + zoom * 2);
      zoom--;
    } else if (dark[1] < 255) {
      di(titlelogo, 0, 0, 750, 500);
      noStroke();
      fill(255, 255, 255, dark[1]);
      rect(0, 0, 750, 500);
      dark[1] += 5;
    } else if (dark[2] > 0) {
      di(title, 0, 0, 750, 500);
      noStroke();
      fill(255, 255, 255, dark[2]);
      rect(0, 0, 750, 500);
      dark[2] -= 3;
    } else {
      di(title, 0, 0, 750, 500);
      scene = 0;
    }

  } else if (scene === 0) { // タイトル
    background(255);
    demo++;
    di(title, 0, 0, 750, 500);
    fill(0);
    textSize(50);
    text("click to start", 210, 450);
    if (demo >= 660) {
      noStroke();
      fill(0);
      rect(0, 0, width, height);
      scene = -2;
      demo = 0;
      tile = [
        [1, 1, 2, 2, 0, 0, 0, 0, 0],
        [2, 2, 1, 1, 0, 0, 0, 0, 0],
        [2, 2, 2, 1, 0, 0, 0, 0, 0],
        [1, 2, 2, 2, 0, 0, 0, 0, 0],
        [2, 2, 1, 2, 0, 0, 0, 0, 0],
        [2, 2, 1, 1, 0, 0, 0, 0, 0],
        [2, 1, 1, 1, 0, 0, 0, 0, 0],
        [2, 1, 1, 1, 0, 0, 0, 0, 0]
      ];
      next = [2, 2, 2, 1, 1, 1, 2, 2];
      song1.stop();
      song4.loop();
    } else if (demo >= 600) {
      noStroke();
      fill(0, 0, 0, map(demo, 600, 660, 0, 255));
      rect(0, 0, width, height);
    }

  } else if (scene === 1) { // ゲーム画面
    background(255);
    bgroop--;
    if (bgroop <= -height * 2.589) bgroop = 0;
    di(imgScreen, bgroop, 0, height * 2.589, height);
    di(imgScreen, bgroop + height * 2.589, 0, height * 2.589, height);
    stroke(0);
    limit--;

    // 危険ライン
    siren = 0;
    for (let i = 0; i < 8; i++) {
      if (tile[i][8] >= 1) {
        siren++;
        strokeWeight(2);
        stroke(255, 0, 0);
        fill(230, 46, 86, 120);
        rect(66 + i * 40, -20, 40, 520);
        if (!warning.isPlaying()) warning.loop();
      }
    }
    if (siren === 0 && warning.isPlaying()) warning.stop();
    stroke(0);

    drawGrid();
    drawTiles();

    fill(0);
    textSize(30);
    text("NEXT:" + limit, 420, 30);
    strokeWeight(1);
    fill(169, 169, 169, 150);
    rect(420, 50, 300, 40);
    fill(124, 252, 0);
    rect(420, 50, map(limit, 0, limitMAX, 0, 300), 40);
    if (limit <= 0) {
      state = 1;
      limitMAX = 300 - floor(score / 50);
      if (limitMAX < 20) limitMAX = 20;
      limit = limitMAX;
    }

    strokeWeight(1);
    if (state === 0) {
      drawNext();
    } else if (state === 1) {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 9; j++) {
          if (tile[i][j] >= 1 && j > high[i]) {
            if (j === 8) {
              scene = 2;
              se2.play();
            } else {
              high[i] = j;
            }
          }
        }
      }
      if (scene === 1) {
        for (let i = 0; i < 8; i++) {
          if (high[i] === 0 && tile[i][0] === 0) high[i] = -1;
          tile[i][high[i] + 1] = next[i];
        }
      }
      for (let i = 0; i < 8; i++) {
        next[i] = int(random(1, 3));
        high[i] = 0;
      }
      state = 0;
    }

    fill(0);
    textSize(30);
    text("SCORE:" + score, 420, 130);
    di(fukidashi, 440, 150, 250, 170); // フキダシサイズはここ
    least = 4 + floor(score / 1000);
    text("connect", 505, 180);
    fill(230, 0, 0);
    textSize(110);
    text(least, 525, 280);

    drawShacch();

  } else if (scene === 2) { // ゲームオーバー
    warning.stop();
    song2.stop();
    background(0);
    fill(255);
    textSize(80);
    text("GAME OVER", 130, 200);
    textSize(60);
    text("SCORE:" + score, 60, 350);
    di(shacch[10], 460, 250, 230, 230);
    textSize(30);
    text("click to back to title", 80, 440);

  } else if (scene === 3) { // お名前入力
    background(255);
    input++;
    di(ranking, 0, 0, 750, 500);
    fill(0, 0, 230);
    textSize(37);
    text("Enter your name by the keyboard", 80, 160);
    textSize(20);
    text("Press Enter key to finish entering", 230, 445);
    strokeWeight(3);
    fill(0);
    line(280, 330, 330, 330);
    line(350, 330, 400, 330);
    line(420, 330, 470, 330);
    textSize(65);
    fill(255, 88, 233);
    text(playerNameE[0], 283, 320);
    text(playerNameE[1], 353, 320);
    text(playerNameE[2], 423, 320);
    if (input >= 3600) commitName();

  } else if (scene === 4) { // ランキング
    background(255);
    di(ranking, 0, 0, 750, 500);
    rankingTime++;
    const rankX = 750 - (rankingTime % 420) * 6;
    if (rankingTime < 420) {
      textSize(60);
      fill(0);
      for (let i = 0; i < 5; i++) {
        if (i === 0) {
          text("1st:" + rankName[0] + " " + rankPoint[0], max(rankX, 60), 160);
        } else if (i === 1) {
          text("2nd:" + rankName[1] + " " + rankPoint[1], max(rankX + 70, 60), 230);
        } else if (i === 2) {
          text("3rd:" + rankName[2] + " " + rankPoint[2], max(rankX + 140, 60), 300);
        } else {
          text((i + 1) + "th:" + rankName[i] + " " + rankPoint[i], max(rankX + 70 * i, 60), 160 + 70 * i);
        }
      }
    } else if (rankingTime < 840) {
      textSize(60);
      fill(0);
      for (let i = 5; i < 10; i++) {
        text((i + 1) + "th:" + rankName[i] + " " + rankPoint[i], max(rankX + 70 * (i - 5), 60), 160 + 70 * (i - 5));
      }
    } else if (rankingTime >= 900) {
      scene = -1;
      reset();
      song3.stop();
      song3.amp(1);
      song1.loop();
    } else {
      if (rankingTime <= 850) song3.amp(map(rankingTime, 800, 850, 1, 0));
      noStroke();
      if (rankingTime <= 850) {
        fill(0, 0, 0, map(rankingTime, 800, 850, 255, 0));
      } else {
        fill(0);
      }
      rect(0, 0, 750, 5000);
      if (rankingTime <= 850) {
        fill(255, 255, 255, map(rankingTime, 800, 850, 255, 0));
      } else {
        fill(255);
      }
      textSize(20);
      text("(c)ASAEDA", 600, 490);
    }
  }
}

// ------------------------------------------------------------
//  描画の共通部分
// ------------------------------------------------------------
function drawGrid() {
  for (let i = 0; i < 9; i++) { // 縦ライン
    strokeWeight(i === 0 || i === 8 ? 2 : 1);
    line(66 + i * 40, 110, 66 + i * 40, 470);
  }
  for (let i = 0; i < 10; i++) { // 横ライン
    strokeWeight(i === 9 ? 2 : 1);
    line(66, 110 + i * 40, 386, 110 + i * 40);
  }
  strokeWeight(2);
  line(66, 30, 66, 70);
  line(66, 30, 386, 30);
  line(66, 70, 386, 70);
  line(386, 30, 386, 70);
  noStroke();
  fill(169, 169, 169, 150);
  rect(66, 110, 320, 360);
  stroke(0);
}

function drawTiles() {
  strokeWeight(1);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 9; j++) {
      if (tile[i][j] === 1) {        // 黒タイル
        fill(30);
        rect(66 + i * 40, 430 - j * 40, 40, 40);
      } else if (tile[i][j] === 2) { // 白タイル
        fill(255);
        rect(66 + i * 40, 430 - j * 40, 40, 40);
      }
    }
  }
}

function drawNext() {
  for (let i = 0; i < 8; i++) {
    if (next[i] === 1) {
      fill(30);
      rect(66 + i * 40, 30, 40, 40);
    } else if (next[i] === 2) {
      fill(255);
      rect(66 + i * 40, 30, 40, 40);
    }
  }
}

function drawShacch() {
  if (shacchAnm === 0) {
    di(shacch[0], 460, 280, 230, 230);
    shacchAnm = 1;
  } else {
    shacchAnm++;
    if (shacchAnm < 90) {
      di(shacch[floor(shacchAnm / 10)], 460, 280, 230, 230);
    } else {
      di(shacch[floor((180 - shacchAnm) / 10)], 460, 280, 230, 230);
      if (shacchAnm === 180) shacchAnm = 0;
    }
  }
}

// ------------------------------------------------------------
//  入力
// ------------------------------------------------------------
function mousePressed() {
  if (!started) {
    started = true;
    userStartAudio();
    song1.loop();
    return;
  }

  if (scene === -1) {
    scene = 0;

  } else if (scene === 0) { // タイトル
    scene = 1;
    // 下四段を適当なタイルで埋める
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) {
        tile[i][j] = int(random(1, 3));
      }
    }
    // NEXTも決める
    for (let i = 0; i < 8; i++) next[i] = int(random(1, 3));
    song1.stop();
    song2.loop();

  } else if (scene === 1) { // ゲーム画面
    if (state === 0) { // 落下中は入力を受け付けない
      if (66 <= mouseX && mouseX < 386 && 470 > mouseY && mouseY >= 110) {
        cx = floor((mouseX - 66) / 40);
        cy = 8 - floor((mouseY - 110) / 40);
        if (tile[cx][cy] === 1) {        // 黒タイルをクリック(破壊)
          Btile(1);
        } else if (tile[cx][cy] === 2) { // 白タイルをクリック(反転)
          treverse(cx, cy);
        }
      } else if (66 <= mouseX && mouseX < 386 && 70 > mouseY && mouseY >= 30) { // NEXT落下
        state = 1;
        limit = limitMAX;
      }
    }

  } else if (scene === 2) { // ゲームオーバー
    se2.stop();
    song1.loop();
    scene = -1;
    reset();
    // input = 0;
    // playerNameE = [" ", " ", " "];
    // pN = 0;
    // for (let i = 0; i <= 9; i++) {
    //   if (score >= rankPoint[i]) {
    //     for (let j = 9; j > i; j--) {
    //       rankName[j] = rankName[j - 1];
    //       rankPoint[j] = rankPoint[j - 1];
    //     }
    //     playerRank = i;
    //     rankPoint[i] = score;
    //     break;
    //   }
    // }
    // if (playerRank < 0) scene = 4;

  } else if (scene === 4) { // ランキング
    if (demo === -1) {
      scene = -1;
      reset();
      song3.stop();
      song1.loop();
    }

  } else if (scene === -2) { // 遊び方をスキップ
    scene = -1;
    song4.stop();
    reset();
    song1.loop();
  }
}

function keyPressed() {
  if (scene === 3) {
    const up = (typeof key === "string" ? key : "").toUpperCase();
    if (/^[A-Z]$/.test(up)) {
      playerNameE[pN] = up;
      nextpn();
    } else if (".!&?0123456789 ".includes(key)) {
      playerNameE[pN] = key;
      nextpn();
    } else if (keyCode === BACKSPACE) {
      if (playerNameE[pN] === " " && pN > 0) pN--;
      playerNameE[pN] = " ";
    } else if (keyCode === ENTER) {
      commitName();
    }
  }
  return false; // スペースキーでページがスクロールしないように
}

function nextpn() {
  if (pN < 2) pN++;
}

function commitName() {
  scene = 4;
  playerName = playerNameE[0] + playerNameE[1] + playerNameE[2];
  if (playerName === "   ") playerName = "NoName";
  rankName[playerRank] = playerName;
}

// ------------------------------------------------------------
//  ゲームロジック
// ------------------------------------------------------------
function treverse(x, y) { // 上下左右のタイルを反転させる
  flip(x, y + 1);
  flip(x, y - 1);
  flip(x + 1, y);
  flip(x - 1, y);
}

function flip(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 8) return;
  if (tile[x][y] === 1) {
    tile[x][y] = 2;
  } else if (tile[x][y] === 2) {
    tile[x][y] = 1;
  }
}

function brake(x, y) { // 破壊するタイルを走査
  check[x][y] = 1;
  broken++;
  if (x - 1 >= 0 && tile[x - 1][y] === 1 && check[x - 1][y] <= 0) brake(x - 1, y);
  if (y - 1 >= 0 && tile[x][y - 1] === 1 && check[x][y - 1] <= 0) brake(x, y - 1);
  if (y + 1 <= 8 && tile[x][y + 1] === 1 && check[x][y + 1] <= 0) brake(x, y + 1);
  if (x + 1 <= 7 && tile[x + 1][y] === 1 && check[x + 1][y] <= 0) brake(x + 1, y);
  check[x][y] = -1;
}

function Btile(mode) {
  if (mode === 1) {
    brake(cx, cy);
  } else if (mode === 2) {
    brake(6, 2);
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 9; j++) {
      if (check[i][j] === -1 && broken >= least) tile[i][j] = 0;
      check[i][j] = 0;
    }
  }

  if (broken >= least) { // 得点加算と落下処理
    // 注意: Java の ^ は排他的論理和。元コードの挙動をそのまま残しています
    score += (broken ^ 2) * 10;

    let a = 1;
    while (a >= 1) {
      a = 0;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 9; j++) {
          if (tile[i][j] === 0) {
            space[i][j] = -1;
          } else if (j >= 1) {
            if (tile[i][j] === 1 || tile[i][j] === 2) {
              for (let k = j; k >= 0; k--) {
                if (space[i][k] === -1) {
                  for (let l = j; l < 9; l++) tile[i][l - 1] = tile[i][l];
                  tile[i][8] = 0;
                  k = -1;
                  a++;
                }
              }
            }
          }
        }
      }
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 9; j++) space[i][j] = 0;
      }
    }
    se.play();
  }
  broken = 0;
}

function reset() {
  state = 0;
  limit = 300;
  score = 0;
  broken = 0;
  cx = 0;
  cy = 0;
  least = 4;
  falling = 0;
  gameover = 0;
  bgroop = 0;
  limitMAX = 300;
  shacchAnm = 0;
  siren = 0;
  playerRank = -1;
  zoom = 300;
  pN = 0;
  rankingTime = 0;
  cursorxy = [430, 350];
  demo = 0;
  input = 0;
  playerNameE = [" ", " ", " "];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 9; j++) {
      tile[i][j] = 0;
      check[i][j] = 0;
      space[i][j] = 0;
    }
    next[i] = 0;
    high[i] = 0;
    fall[i] = 0;
  }
  dark = [255, 0, 255];
}

// ------------------------------------------------------------
//  ユーティリティ
// ------------------------------------------------------------
function make2D(w, h, v = 0) {
  return Array.from({ length: w }, () => new Array(h).fill(v));
}

// 画像読み込み（失敗しても落ちないように読み込み済みフラグを持たせる）
function img(name) {
  const o = loadImage(
    DATA + name,
    () => { o.__ok = true; },
    () => { console.warn("画像が見つかりません: " + DATA + name); }
  );
  return o;
}

// 読み込めた画像だけ描く
function di(im, ...args) {
  if (im && im.__ok) image(im, ...args);
}

// 音の読み込み（未読み込みでもエラーにならないラッパー）
function snd(name) {
  const o = { file: null };
  o.play = () => { if (o.file) o.file.play(); };
  o.loop = () => { if (o.file && !o.file.isPlaying()) o.file.loop(); };
  o.stop = () => { if (o.file) o.file.stop(); };
  o.isPlaying = () => (o.file ? o.file.isPlaying() : false);
  o.amp = (v) => { if (o.file) o.file.setVolume(v); };
  o.file = loadSound(
    DATA + name,
    () => {},
    () => { o.file = null; console.warn("音声が見つかりません: " + DATA + name); }
  );
  return o;
}
