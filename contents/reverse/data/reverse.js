let scene = -1;
let title, screenImg, titlebg, titlelogo, fukidashi, ranking, cursor;
let tile = Array.from({ length: 8 }, () => Array(9).fill(0));
let check = Array.from({ length: 8 }, () => Array(9).fill(0));
let space = Array.from({ length: 8 }, () => Array(9).fill(0));
let next = Array(8).fill(0);
let high = Array(8).fill(0);
let fall = Array(8).fill(0);
let cursorxy = [430, 350];
let shacch = [];
let serif = [];
let rankName = ["ASA", "KKN", "SRC", "ISU", "WCO", "KKY", "EBI", "KRB", "YJP", "MUR"];
let playerNameE = [' ', ' ', ' '];
let playerName = "";
let rankPoint = [10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000];
let state = 0;
let limit = 300;
let score = 0;
let broken = 0;
let cx = 0;
let cy = 0;
let least = 4;
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

function preload() {
  // 画像パスはご自身の環境に合わせて調整してください
  title = loadImage("title.png");
  titlebg = loadImage("REVERSEbg.png");
  titlelogo = loadImage("REVERSElogo.png");
  screenImg = loadImage("bgsky.jpg");
  fukidashi = loadImage("fukidashi.png");
  ranking = loadImage("ranking.png");
  cursor = loadImage("mouse.png");
  for (let i = 0; i < 11; i++) {
    if (i == 10) {
      shacch[i] = loadImage("shacch_miss.png");
    } else {
      shacch[i] = loadImage("shacch" + (i + 1) + ".png");
    }
  }
  for (let i = 0; i < 7; i++) {
    serif[i] = loadImage("serif" + (i + 1) + ".png");
  }
}

function setup() {
  createCanvas(750, 500);
}

function draw() {
  if (scene == -2) { // 遊び方/デモ
    background(255);
    bgroop--;
    score = 0;
    demo++;
    let bgWidth = height * 2.589;
    if (bgroop <= -bgWidth) bgroop = 0;
    image(screenImg, bgroop, 0, bgWidth, height);
    image(screenImg, bgroop + bgWidth, 0, bgWidth, height);

    if (demo > 450 && demo <= 550) limit -= 3;
    else if (demo > 1040 && demo <= 1190) limit -= 6;

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
    
    drawGrid();

    // タイル描写
    strokeWeight(1);
    stroke(0);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 9; j++) {
        if (tile[i][j] == 1) { fill(30); rect(66 + i * 40, 430 - j * 40, 40, 40); }
        else if (tile[i][j] == 2) { fill(255); rect(66 + i * 40, 430 - j * 40, 40, 40); }
      }
    }

    drawUI();
    handleState();
    handleShacchAnm();

    // デモ用カーソル移動
    if (demo > 150 && demo < 240) {
      cursorxy[0] = map(demo, 150, 240, 430, 166);
      cursorxy[1] = map(demo, 150, 240, 350, 410);
    } else if (demo == 240) {
      treverse(2, 1);
    } else if (demo > 300 && demo < 390) {
      cursorxy[0] = map(demo, 300, 390, 166, 346);
      cursorxy[1] = map(demo, 300, 390, 410, 370);
    } else if (demo == 390) {
      Btile(2);
    } else if (demo > 690 && demo < 830) {
      cursorxy[0] = map(demo, 690, 830, 346, 226);
      cursorxy[1] = map(demo, 690, 830, 370, 50);
    } else if (demo == 830) {
      state = 1;
      limit = limitMAX;
    }
    image(cursor, cursorxy[0], cursorxy[1]);

    // セリフ
    if (demo > 60 && demo < 120) image(serif[0], 440, 150, 250, 170);
    else if (demo > 150 && demo < 270) image(serif[1], 440, 150, 250, 170);
    else if (demo > 300 && demo < 420) image(serif[2], 440, 150, 250, 170);
    else if (demo > 450 && demo < 660) image(serif[3], 440, 150, 250, 170);
    else if (demo > 690 && demo < 860) image(serif[4], 440, 150, 250, 170);
    else if (demo > 890 && demo < 1010) image(serif[5], 440, 150, 250, 170);
    else if (demo > 1040 && demo < 1220) image(serif[6], 440, 150, 250, 170);
    else if (demo >= 1220) {
      noStroke();
      fill(0, 0, 0, map(demo, 1160, 1190, 0, 255));
      rect(0, 0, width, height);
      if (demo >= 1270) { scene = 4; demo = -1; }
    }
    if (demo <= 60) {
      noStroke();
      fill(0, 0, 0, map(demo, 0, 60, 255, 0));
      rect(0, 0, width, height);
    }

  } else if (scene == -1) { // OP
    background(255);
    image(titlebg, 0, 0, 750, 500);
    if (dark[0] > 0) {
      noStroke(); fill(0, 0, 0, dark[0]); rect(0, 0, 750, 500); dark[0]--;
    } else if (zoom > 0) {
      image(titlelogo, -zoom, -zoom, 750 + zoom * 2, 500 + zoom * 2); zoom--;
    } else if (dark[1] < 255) {
      image(titlelogo, 0, 0, 750, 500);
      noStroke(); fill(255, 255, 255, dark[1]); rect(0, 0, 750, 500); dark[1] += 5;
    } else if (dark[2] > 0) {
      image(title, 0, 0, 750, 500);
      noStroke(); fill(255, 255, 255, dark[2]); rect(0, 0, 750, 500); dark[2] -= 3;
    } else {
      image(title, 0, 0, 750, 500); scene = 0;
    }

  } else if (scene == 0) { // タイトル
    background(255);
    demo++;
    image(title, 0, 0, 750, 500);
    fill(0); textSize(50); textAlign(LEFT, BASELINE);
    text("click to start", 210, 450);
    if (demo >= 660) {
      noStroke(); fill(0); rect(0, 0, width, height);
      scene = -2; demo = 0;
      tile = [[1,1,2,2,0,0,0,0,0],[2,2,1,1,0,0,0,0,0],[2,2,2,1,0,0,0,0,0],[1,2,2,2,0,0,0,0,0],[2,2,1,2,0,0,0,0,0],[2,2,1,1,0,0,0,0,0],[2,1,1,1,0,0,0,0,0],[2,1,1,1,0,0,0,0,0]];
      next = [2, 2, 2, 1, 1, 1, 2, 2];
    } else if (demo >= 600) {
      noStroke(); fill(0, 0, 0, map(demo, 600, 660, 0, 255)); rect(0, 0, width, height);
    }

  } else if (scene == 1) { // ゲーム本編
    background(255);
    bgroop--;
    let bgWidth = height * 2.589;
    if (bgroop <= -bgWidth) bgroop = 0;
    image(screenImg, bgroop, 0, bgWidth, height);
    image(screenImg, bgroop + bgWidth, 0, bgWidth, height);
    limit--;

    // 危険ライン表示
    siren = 0;
    for (let i = 0; i < 8; i++) {
      if (tile[i][8] >= 1) {
        siren++; strokeWeight(2); stroke(255, 0, 0); fill(230, 46, 86, 120); rect(66 + i * 40, -20, 40, 520);
      }
    }
    
    drawGrid();
    
    // タイル描写
    strokeWeight(1); stroke(0);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 9; j++) {
        if (tile[i][j] == 1) { fill(30); rect(66 + i * 40, 430 - j * 40, 40, 40); }
        else if (tile[i][j] == 2) { fill(255); rect(66 + i * 40, 430 - j * 40, 40, 40); }
      }
    }

    drawUI();
    handleState();

    fill(0); textSize(30); text("SCORE:" + score, 420, 130);
    image(fukidashi, 440, 150, 250, 170);
    least = 4 + floor(score / 1000);
    text("connect", 505, 180);
    fill(230, 0, 0); textSize(110); text(least, 525, 280);

    handleShacchAnm();

  } else if (scene == 2) { // ゲームオーバー
    background(0); fill(255); textSize(80); text("GAME OVER", 130, 200);
    textSize(60); text("SCORE:" + score, 60, 350);
    image(shacch[10], 460, 250, 230, 230);
    textSize(30); text("click to check ranking", 80, 440);

  } else if (scene == 3) { // 名前入力
    background(255); input++;
    image(ranking, 0, 0, 750, 500);
    fill(0, 0, 230); textSize(37); text("Enter your name by the keyboard", 80, 160);
    textSize(20); text("Press Enter key to finish entering", 230, 445);
    strokeWeight(3); stroke(0);
    line(280, 330, 330, 330); line(350, 330, 400, 330); line(420, 330, 470, 330);
    textSize(65); fill(255, 88, 233); noStroke();
    text(playerNameE[0], 283, 320); text(playerNameE[1], 353, 320); text(playerNameE[2], 423, 320);
    if (input >= 3600) finishInput();

  } else if (scene == 4) { // ランキング表示
    background(255); image(ranking, 0, 0, 750, 500);
    rankingTime++;
    let rankX = 750 - (rankingTime % 420) * 6;
    fill(0); textSize(60);
    if (rankingTime < 420) {
      for (let i = 0; i < 5; i++) {
        let x = max(60, rankX + (i == 0 ? 0 : (i < 3 ? i * 70 : i * 70)));
        let label = (i + 1) + (i == 0 ? "st" : i == 1 ? "nd" : i == 2 ? "rd" : "th");
        text(label + ":" + rankName[i] + " " + rankPoint[i], x, 160 + i * 70);
      }
    } else if (rankingTime < 840) {
      for (let i = 5; i < 10; i++) {
        let x = max(60, rankX + 70 * (i - 5));
        text((i + 1) + "th:" + rankName[i] + " " + rankPoint[i], x, 160 + 70 * (i - 5));
      }
    } else if (rankingTime >= 900) {
      scene = -1; reset();
    } else {
      noStroke();
      fill(0, 0, 0, rankingTime <= 850 ? map(rankingTime, 800, 850, 255, 0) : 255);
      rect(0, 0, 750, 500);
      fill(255, 255, 255, rankingTime <= 850 ? map(rankingTime, 800, 850, 255, 0) : 255);
      textSize(20); text("(c)ASAEDA", 600, 490);
    }
  }
}

// 補助描画関数群
function drawGrid() {
  stroke(0);
  for (let i = 0; i < 9; i++) {
    strokeWeight(i == 0 || i == 8 ? 2 : 1);
    line(66 + i * 40, 110, 66 + i * 40, 470);
  }
  for (let i = 0; i < 10; i++) {
    strokeWeight(i == 9 ? 2 : 1);
    line(66, 110 + i * 40, 386, 110 + i * 40);
  }
  strokeWeight(2);
  line(66, 30, 386, 30); line(66, 70, 386, 70); line(66, 30, 66, 70); line(386, 30, 386, 70);
  noStroke(); fill(169, 169, 169, 150); rect(66, 110, 320, 360);
}

function drawUI() {
  fill(0); textSize(30); noStroke();
  text("NEXT:" + limit, 420, 30);
  fill(169, 169, 169, 150); rect(420, 50, 300, 40);
  fill(124, 252, 0); rect(420, 50, map(limit, 0, limitMAX, 0, 300), 40);
}

function handleState() {
  if (limit <= 0) {
    state = 1;
    limitMAX = max(20, 300 - floor(score / 50));
    limit = limitMAX;
  }
  if (state === 0) {
    for (let i = 0; i < 8; i++) {
      if (next[i] == 1) { fill(30); rect(66 + i * 40, 30, 40, 40); }
      else if (next[i] == 2) { fill(255); rect(66 + i * 40, 30, 40, 40); }
    }
  } else if (state === 1) {
    for (let i = 0; i < 8; i++) {
      high[i] = -1;
      for (let j = 0; j < 9; j++) {
        if (tile[i][j] >= 1) {
          if (j > high[i]) {
            if (j == 8) scene = 2;
            else high[i] = j;
          }
        }
      }
      if (scene != 2) tile[i][high[i] + 1] = next[i];
    }
    for (let i = 0; i < 8; i++) {
      next[i] = floor(random(1, 3));
      high[i] = 0;
    }
    state = 0;
  }
}

function handleShacchAnm() {
  if (shacchAnm == 0) {
    image(shacch[0], 460, 280, 230, 230);
    shacchAnm = 1;
  } else {
    shacchAnm++;
    let idx = shacchAnm < 90 ? floor(shacchAnm / 10) : floor((180 - shacchAnm) / 10);
    image(shacch[max(0, idx)], 460, 280, 230, 230);
    if (shacchAnm >= 180) shacchAnm = 0;
  }
}

function mousePressed() {
  if (scene == -1) scene = 0;
  else if (scene == 0) {
    scene = 1;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) tile[i][j] = floor(random(1, 3));
      next[i] = floor(random(1, 3));
    }
  } else if (scene == 1 && state == 0) {
    if (mouseX >= 66 && mouseX < 386 && mouseY >= 110 && mouseY < 470) {
      cx = floor((mouseX - 66) / 40);
      cy = 8 - floor((mouseY - 110) / 40);
      if (tile[cx][cy] == 1) Btile(1);
      else if (tile[cx][cy] == 2) treverse(cx, cy);
    } else if (mouseX >= 66 && mouseX < 386 && mouseY >= 30 && mouseY < 70) {
      state = 1; limit = limitMAX;
    }
  } else if (scene == 2) {
    scene = 3;
    playerRank = -1;
    for (let i = 0; i < 10; i++) {
      if (score >= rankPoint[i]) {
        for (let j = 9; j > i; j--) {
          rankName[j] = rankName[j - 1];
          rankPoint[j] = rankPoint[j - 1];
        }
        playerRank = i;
        rankPoint[i] = score;
        break;
      }
    }
    if (playerRank < 0) scene = 4;
  } else if (scene == 4 && demo == -1) {
    scene = -1; reset();
  } else if (scene == -2) {
    scene = -1; reset();
  }
}

function treverse(x, y) {
  let dx = [0, 0, 1, -1], dy = [1, -1, 0, 0];
  for (let i = 0; i < 4; i++) {
    let nx = x + dx[i], ny = y + dy[i];
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 9) {
      if (tile[nx][ny] == 1) tile[nx][ny] = 2;
      else if (tile[nx][ny] == 2) tile[nx][ny] = 1;
    }
  }
}

function brake(x, y) {
  check[x][y] = 1;
  broken++;
  let dx = [-1, 0, 0, 1], dy = [0, -1, 1, 0];
  for (let i = 0; i < 4; i++) {
    let nx = x + dx[i], ny = y + dy[i];
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 9 && tile[nx][ny] == 1 && check[nx][ny] <= 0) {
      brake(nx, ny);
    }
  }
  check[x][y] = -1;
}

function Btile(mode) {
  if (mode == 1) brake(cx, cy);
  else if (mode == 2) brake(6, 2);

  if (broken >= least) {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 9; j++) {
        if (check[i][j] == -1) tile[i][j] = 0;
      }
    }
    score += Math.pow(broken, 2) * 10;
    
    // 落下処理
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < 8; i++) {
        for (let j = 1; j < 9; j++) {
          if (tile[i][j] > 0 && tile[i][j-1] == 0) {
            tile[i][j-1] = tile[i][j];
            tile[i][j] = 0;
            changed = true;
          }
        }
      }
    }
  }
  // Reset check array
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 9; j++) check[i][j] = 0;
  }
  broken = 0;
}

function keyPressed() {
  if (scene == 3) {
    if (key.length == 1 && key.match(/[a-zA-Z0-9.!&? ]/)) {
      playerNameE[pN] = key.toUpperCase();
      nextpn();
    } else if (keyCode == BACKSPACE) {
      if (playerNameE[pN] == ' ' && pN > 0) pN--;
      playerNameE[pN] = ' ';
    } else if (keyCode == ENTER) {
      finishInput();
    }
  }
}

function finishInput() {
  scene = 4;
  playerName = playerNameE.join("").trim();
  if (playerName === "") playerName = "NoName";
  if (playerRank >= 0) rankName[playerRank] = playerName;
}

function nextpn() {
  if (pN < 2) pN++;
}

function reset() {
  state = 0; limit = 300; score = 0; broken = 0;
  cx = 0; cy = 0; least = 4; falling = 0; gameover = 0;
  bgroop = 0; limitMAX = 300; shacchAnm = 0; siren = 0;
  playerRank = -1; zoom = 300; pN = 0; rankingTime = 0;
  cursorxy = [430, 350]; demo = 0; input = 0;
  tile = Array.from({ length: 8 }, () => Array(9).fill(0));
  check = Array.from({ length: 8 }, () => Array(9).fill(0));
  space = Array.from({ length: 8 }, () => Array(9).fill(0));
  next.fill(0); high.fill(0); fall.fill(0);
  dark = [255, 0, 255];
}