const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const LANG_KEY = "djcarl-lang";
let currentLang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr";

function nested(obj, path) {
  return String(path).split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function t(path) {
  const val = nested(I18N[currentLang], path);
  if (val != null) return val;
  return nested(I18N.fr, path);
}

$("#year").textContent = new Date().getFullYear();
document.body.classList.add("is-ready");

$("#menuBtn").onclick = () => $("#mainNav").classList.toggle("open");
$$("#mainNav a").forEach((a) => {
  a.onclick = () => $("#mainNav").classList.remove("open");
});

const observer = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) e.target.classList.add("visible");
  }),
  { threshold: 0.1 }
);
$$(".reveal").forEach((el) => observer.observe(el));

function animateCount(el) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix || "";
  if (reducedMotion) {
    el.textContent = `${target}${suffix}`;
    return;
  }
  const start = performance.now();
  const duration = 1100;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${Math.round(target * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const stats = $$(".hero-stats strong[data-count]");
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    animateCount(e.target);
    statsObserver.unobserve(e.target);
  });
}, { threshold: 0.6 });
stats.forEach((el) => statsObserver.observe(el));

(function initPhotoShow() {
  const root = $("#photoShow");
  if (!root) return;
  const slides = $$(".photo-show-track img", root);
  const indexEl = $("#photoShowIndex");
  const prev = root.querySelector(".photo-show-nav.prev");
  const next = root.querySelector(".photo-show-nav.next");
  let i = 0;
  let timer;

  function go(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach((img, idx) => img.classList.toggle("is-active", idx === i));
    if (indexEl) indexEl.textContent = `${i + 1} / ${slides.length}`;
  }

  function play() {
    clearInterval(timer);
    if (reducedMotion || slides.length < 2) return;
    timer = setInterval(() => go(i + 1), 4200);
  }

  prev?.addEventListener("click", () => {
    go(i - 1);
    play();
  });
  next?.addEventListener("click", () => {
    go(i + 1);
    play();
  });
  root.addEventListener("mouseenter", () => clearInterval(timer));
  root.addEventListener("mouseleave", play);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInterval(timer);
    else play();
  });

  go(0);
  play();
})();

const EXP_META = [
  { icon: "🥂", mood: "accueil" },
  { icon: "🎶", mood: "souper" },
  { icon: "✨", mood: "moments" },
  { icon: "🔥", mood: "party" }
];

function setExperience(step) {
  const d = t("experience.steps")[step];
  const meta = EXP_META[step];
  $$(".timeline-item").forEach((x) => x.classList.toggle("active", Number(x.dataset.step) === step));
  $("#expIcon").textContent = meta.icon;
  $("#expTitle").textContent = d.title;
  $("#expText").textContent = d.text;
  $("#expDisplay").dataset.mood = meta.mood;
}

$$(".timeline-item").forEach((btn) => {
  btn.onclick = () => {
    setExperience(Number(btn.dataset.step));
    pauseTimeline();
  };
});

let timelineTimer;
let timelineStep = 0;
function pauseTimeline() {
  clearInterval(timelineTimer);
  timelineTimer = null;
}
function startTimeline() {
  if (reducedMotion || timelineTimer) return;
  timelineTimer = setInterval(() => {
    timelineStep = (timelineStep + 1) % EXP_META.length;
    setExperience(timelineStep);
  }, 4500);
}

const expObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) startTimeline();
    else pauseTimeline();
  });
}, { threshold: 0.35 });
expObserver.observe($("#experiences"));

const EVENT_META = {
  mariage: "💍",
  corporatif: "🏢",
  prive: "🎉",
  karaoke: "🎤"
};

function applyEvent(id, animate = true) {
  const d = t("events.items")[id];
  if (!d) return;
  $$(".event-tab").forEach((x) => x.classList.toggle("active", x.dataset.event === id));
  $("#eventKicker").textContent = d.kicker;
  $("#eventTitle").textContent = d.title;
  $("#eventText").textContent = d.text;
  $("#eventList").innerHTML = d.list.map((x) => `<li>${x}</li>`).join("");
  $("#posterEmoji").textContent = EVENT_META[id];
  $("#posterText").textContent = d.poster;
  if (!animate) return;
  const showcase = $("#eventShowcase");
  showcase.classList.remove("is-switching");
  void showcase.offsetWidth;
  showcase.classList.add("is-switching");
}

$$(".event-tab").forEach((btn) => {
  btn.onclick = () => applyEvent(btn.dataset.event);
});

function renderReviews() {
  const label = t("reviews.label");
  const items = t("reviews.items") || [];
  const list = $("#reviewsList");
  if (!list) return;
  list.innerHTML = items.slice(0, 10).map((r) => `
    <article class="review-list-card reveal">
      <div class="stars">${"★".repeat(r[2])}</div>
      <blockquote>« ${r[0]} »</blockquote>
      <strong>${r[1]}</strong>
      <small>${label}</small>
    </article>
  `).join("");
  $$("#reviewsList .reveal").forEach((el) => observer.observe(el));
}

renderReviews();

function showDemo(name) {
  $$(".demo-tab[data-demo]").forEach((tab) => {
    const on = tab.dataset.demo === name;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });
  $$(".demo-panel").forEach((panel) => {
    const on = panel.dataset.demo === name;
    panel.hidden = !on;
    panel.classList.toggle("is-on", on);
  });
}

function showTheme(name) {
  $$(".demo-tab[data-theme]").forEach((tab) => {
    const on = tab.dataset.theme === name;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });
  $$(".theme-panel").forEach((panel) => {
    const on = panel.dataset.theme === name;
    panel.hidden = !on;
    panel.classList.toggle("is-on", on);
  });
}

function playDemo(name) {
  showDemo(name);
  const el = $("#demos");
  if (el) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

document.addEventListener("click", (e) => {
  const themeTab = e.target.closest(".demo-tab[data-theme]");
  if (themeTab) {
    showTheme(themeTab.dataset.theme);
    return;
  }
  const tab = e.target.closest(".demo-tab[data-demo]");
  if (tab) {
    showDemo(tab.dataset.demo);
    return;
  }
  const quizSet = e.target.closest("[data-quiz-set]");
  if (quizSet) {
    applyQuizSet(quizSet.dataset.quizSet);
    return;
  }
  const quizBtn = e.target.closest("#pageQuizGrid button");
  if (quizBtn && !quizBtn.disabled) {
    answerQuiz(quizBtn);
    return;
  }
  const bingoSet = e.target.closest("[data-bingo-set]");
  if (bingoSet) {
    applyBingoSet(bingoSet.dataset.bingoSet);
    return;
  }
  const bingoCell = e.target.closest("#bingoCard [data-cell]");
  if (bingoCell) {
    popBingo.toggle(Number(bingoCell.dataset.cell));
    return;
  }
  const wheelSet = e.target.closest("[data-wheel-set]");
  if (wheelSet) {
    applyWheelSet(wheelSet.dataset.wheelSet);
    return;
  }
  if (e.target.closest("#wheelSpin, #wheelDisc, .wheel-scene")) {
    e.preventDefault();
    spinWheel();
  }
});

function quizSets() {
  return t("quiz.sets");
}

let quizMode = "vote";

function applyQuizSet(id) {
  const set = quizSets()[id] || quizSets().funny;
  quizMode = set.mode;
  const question = $("#quizQuestion");
  if (question) question.textContent = set.question;
  const grid = $("#pageQuizGrid");
  if (!grid) return;
  grid.innerHTML = set.answers.map((label, i) => {
    const correct = set.mode === "quiz" && i === set.correct;
    return `<button type="button" data-correct="${correct}">${label}</button>`;
  }).join("");
  $$("[data-quiz-set]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.quizSet === id);
  });
  const resultEl = $("#pageQuizResult");
  if (resultEl) {
    resultEl.hidden = true;
    resultEl.textContent = "";
  }
}

function answerQuiz(btn) {
  const grid = $("#pageQuizGrid");
  const resultEl = $("#pageQuizResult");
  const set = quizSets()[$("[data-quiz-set].is-on")?.dataset.quizSet] || quizSets().funny;
  $$("button", grid).forEach((b) => { b.disabled = true; });
  resultEl.hidden = false;
  if (quizMode === "vote") {
    btn.classList.add("is-picked");
    resultEl.textContent = String(set.picked).replace("{name}", btn.textContent.trim());
    return;
  }
  const correct = btn.dataset.correct === "true";
  $$("button", grid).forEach((b) => {
    if (b.dataset.correct === "true") b.classList.add("is-correct");
    else b.classList.add("is-wrong");
  });
  resultEl.textContent = correct ? set.ok : set.ko;
}

applyQuizSet("funny");

const BINGO_X = [0, 6, 12, 18, 24, 4, 8, 16, 20];
const BINGO_CONFETTI = ["#e22540", "#1368ce", "#facc15", "#26890c", "#8b5cf6", "#ec4899", "#22d3ee", "#f97316"];

const BINGO_SETS = {
  pop: {
    title: "BINGO MUSICAL POP",
    cells: [
      ["ABBA", "Dancing Queen"], ["Queen", "Don't Stop Me Now"], ["Madonna", "Like a Prayer"],
      ["Michael Jackson", "Billie Jean"], ["Whitney Houston", "I Wanna Dance"], ["Britney Spears", "Baby One More Time"],
      ["Lady Gaga", "Poker Face"], ["Beyoncé", "Single Ladies"], ["Adele", "Rolling in the Deep"],
      ["Taylor Swift", "Shake It Off"], ["Ed Sheeran", "Shape of You"], ["Dua Lipa", "Don't Start Now"],
      ["The Weeknd", "Blinding Lights"], ["Bruno Mars", "Uptown Funk"], ["Pharrell", "Happy"],
      ["Katy Perry", "Firework"], ["Timberlake", "Can't Stop the Feeling"], ["Stromae", "Alors on danse"],
      ["Céline Dion", "Pour que tu m'aimes"], ["Journey", "Don't Stop Believin'"], ["Bon Jovi", "Livin' on a Prayer"],
      ["Cyndi Lauper", "Girls Just Wanna"], ["Village People", "YMCA"], ["Spice Girls", "Wannabe"],
      ["Rihanna", "Don't Stop the Music"]
    ]
  },
  disco: {
    title: "BINGO MUSICAL DISCO",
    cells: [
      ["Bee Gees", "Stayin' Alive"], ["ABBA", "Gimme! Gimme!"], ["Donna Summer", "Hot Stuff"],
      ["Village People", "YMCA"], ["Gloria Gaynor", "I Will Survive"], ["Earth, Wind & Fire", "September"],
      ["Chic", "Le Freak"], ["KC & Sunshine Band", "That's the Way"], ["Sister Sledge", "We Are Family"],
      ["Diana Ross", "Upside Down"], ["The Trammps", "Disco Inferno"], ["Lipps Inc.", "Funkytown"],
      ["Boney M.", "Daddy Cool"], ["Kool & The Gang", "Celebration"], ["Michael Jackson", "Don't Stop 'Til"],
      ["Patrick Hernandez", "Born to Be Alive"], ["Ottawan", "D.I.S.C.O."], ["Cerrone", "Supernature"],
      ["Sheila B. Devotion", "Spacer"], ["Gibson Brothers", "Cuba"], ["Amii Stewart", "Knock on Wood"],
      ["A Taste of Honey", "Boogie Oogie"], ["The Whispers", "And the Beat Goes On"], ["Change", "A Lover's Holiday"],
      ["Silver Convention", "Fly, Robin, Fly"]
    ]
  },
  eighties: {
    title: "BINGO MUSICAL ANNÉES 80",
    cells: [
      ["Madonna", "Like a Virgin"], ["Michael Jackson", "Billie Jean"], ["Whitney Houston", "I Wanna Dance"],
      ["Prince", "Kiss"], ["Cyndi Lauper", "Girls Just Wanna"], ["Bon Jovi", "Livin' on a Prayer"],
      ["Journey", "Don't Stop Believin'"], ["a-ha", "Take On Me"], ["Toto", "Africa"],
      ["Phil Collins", "In the Air Tonight"], ["Wham!", "Wake Me Up"], ["George Michael", "Faith"],
      ["Tina Turner", "What's Love Got"], ["Bonnie Tyler", "Total Eclipse"], ["Europe", "The Final Countdown"],
      ["Survivor", "Eye of the Tiger"], ["Kenny Loggins", "Footloose"], ["Starship", "We Built This City"],
      ["Simple Minds", "Don't You Forget"], ["U2", "With or Without You"], ["Guns N' Roses", "Sweet Child O' Mine"],
      ["Def Leppard", "Pour Some Sugar"], ["Bryan Adams", "Summer of '69"], ["Rick Astley", "Never Gonna Give You Up"],
      ["The Police", "Every Breath You Take"]
    ]
  },
  noel: {
    title: "BINGO MUSICAL DE NOËL",
    cells: [
      ["Mariah Carey", "All I Want for Christmas"], ["Wham!", "Last Christmas"], ["José Feliciano", "Feliz Navidad"],
      ["Bing Crosby", "White Christmas"], ["Nat King Cole", "The Christmas Song"], ["Brenda Lee", "Rockin' Around"],
      ["Bobby Helms", "Jingle Bell Rock"], ["Chuck Berry", "Run Rudolph Run"], ["Band Aid", "Do They Know It's Christmas"],
      ["John Lennon", "Happy Xmas"], ["Ariana Grande", "Santa Tell Me"], ["Kelly Clarkson", "Underneath the Tree"],
      ["Michael Bublé", "It's Beginning to Look"], ["Pentatonix", "Mary, Did You Know?"], ["Trans-Siberian Orchestra", "Christmas Eve"],
      ["Céline Dion", "Feliz Navidad"], ["Garou", "Petit Papa Noël"], ["Tino Rossi", "Petit Papa Noël"],
      ["Frank Sinatra", "Have Yourself"], ["Elvis Presley", "Blue Christmas"], ["The Pogues", "Fairytale of New York"],
      ["Chris Rea", "Driving Home"], ["Slade", "Merry Xmas Everybody"], ["Paul McCartney", "Wonderful Christmastime"],
      ["Dean Martin", "Let It Snow"]
    ]
  },
  country: {
    title: "BINGO MUSICAL COUNTRY",
    cells: [
      ["Shania Twain", "Man! I Feel Like"], ["Johnny Cash", "Ring of Fire"], ["Dolly Parton", "Jolene"],
      ["Garth Brooks", "Friends in Low Places"], ["Luke Bryan", "Country Girl"], ["Florida Georgia Line", "Cruise"],
      ["Carrie Underwood", "Before He Cheats"], ["Blake Shelton", "God's Country"], ["Kenny Rogers", "The Gambler"],
      ["Willie Nelson", "On the Road Again"], ["Tim McGraw", "Live Like You Were Dying"], ["Faith Hill", "This Kiss"],
      ["Brad Paisley", "Alcohol"], ["Keith Urban", "Somebody Like You"], ["Luke Combs", "Beautiful Crazy"],
      ["Morgan Wallen", "Whiskey Glasses"], ["Zac Brown Band", "Chicken Fried"], ["Noah Cyrus", "July"],
      ["Chris Stapleton", "Tennessee Whiskey"], ["Kane Brown", "Heaven"], ["Thomas Rhett", "Die a Happy Man"],
      ["Old Dominion", "One Man Band"], ["Dan + Shay", "Tequila"], ["Jason Aldean", "Dirt Road Anthem"],
      ["Toby Keith", "Should've Been a Cowboy"]
    ]
  },
  quebec: {
    title: "BINGO MUSICAL QUÉBÉCOIS",
    cells: [
      ["Jean Leloup", "1990"], ["Les Cowboys Fringants", "Les étoiles filantes"], ["Daniel Bélanger", "Revivre"],
      ["Ariane Moffatt", "Je veux tout"], ["Marie-Mai", "C.O.B.R.A."], ["Cœur de pirate", "Comme des enfants"],
      ["Karkwa", "Le pyromane"], ["Louis-Jean Cormier", "Le treuil"], ["Fred Pellerin", "Un jour sur le fleuve"],
      ["Beau Dommage", "Le géant Beaupré"], ["Harmonium", "Pour un instant"], ["Ginette Reno", "Je ne suis qu'une chanson"],
      ["Robert Charlebois", "Ordinaire"], ["Diane Dufresne", "J'ai rencontré l'homme"], ["Claude Dubois", "Femme de rêve"],
      ["Éric Lapointe", "N'importe quoi"], ["Kevin Parent", "Seigneur"], ["Isabelle Boulay", "Parle-moi"],
      ["Marjo", "Celle qui va"], ["Laurence Jalbert", "À la vie"], ["Marie-Chantal Toupin", "Dis-moi que tu m'aimes"],
      ["2Frères", "Nous autres"], ["Loud", "Toutes les femmes savent danser"], ["FouKi", "Goumin"],
      ["Les Trois Accords", "Saskatchewan"]
    ]
  }
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyBingoSet(id) {
  const set = BINGO_SETS[id] || BINGO_SETS.pop;
  const title = $("#bingoTitle");
  const grid = $("#bingoCard");
  if (title) title.textContent = t("bingo.titles")[id] || set.title;
  if (grid) {
    grid.innerHTML = set.cells.map(([artist, song], i) => (
      `<button type="button" class="pop-bingo-cell" data-cell="${i}" aria-pressed="false">` +
      `<strong>${escapeHtml(artist)}</strong><span>${escapeHtml(song)}</span></button>`
    )).join("");
  }
  $$("[data-bingo-set]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.bingoSet === id);
  });
  popBingo.reset();
}

const popBingo = {
  marked: new Set(),
  won: false,
  reset() {
    this.marked.clear();
    this.won = false;
    const overlay = $("#bingoWin");
    const board = $("#demoBoard");
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.classList.remove("is-out");
    }
    if ($("#bingoConfetti")) $("#bingoConfetti").innerHTML = "";
    if (board) board.classList.remove("is-win");
  },
  toggle(index) {
    if (!Number.isInteger(index) || index < 0 || index > 24) return;
    const cell = $(`#bingoCard [data-cell="${index}"]`);
    if (!cell) return;
    if (this.marked.has(index)) this.marked.delete(index);
    else this.marked.add(index);
    const on = this.marked.has(index);
    cell.classList.toggle("is-marked", on);
    cell.setAttribute("aria-pressed", on ? "true" : "false");
    cell.classList.remove("is-tapped");
    void cell.offsetWidth;
    cell.classList.add("is-tapped");
    this.checkWin();
  },
  hasX() {
    return BINGO_X.every((i) => this.marked.has(i));
  },
  checkWin() {
    const win = this.hasX();
    $$("#bingoCard [data-cell]").forEach((cell) => {
      const i = Number(cell.dataset.cell);
      cell.classList.toggle("is-x", win && BINGO_X.includes(i));
    });
    const overlay = $("#bingoWin");
    const board = $("#demoBoard");
    if (win && !this.won) {
      this.won = true;
      this.burst();
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      overlay.classList.remove("is-out");
      board.classList.add("is-win");
    } else if (!win && this.won) {
      this.won = false;
      overlay.classList.add("is-out");
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      $("#bingoConfetti").innerHTML = "";
      board.classList.remove("is-win");
    }
  },
  burst() {
    const box = $("#bingoConfetti");
    if (!box) return;
    box.innerHTML = "";
    if (reducedMotion) return;
    for (let i = 0; i < 42; i += 1) {
      const bit = document.createElement("i");
      bit.style.setProperty("--x", `${6 + Math.random() * 88}%`);
      bit.style.setProperty("--d", `${0.7 + Math.random() * 1.1}s`);
      bit.style.setProperty("--c", BINGO_CONFETTI[i % BINGO_CONFETTI.length]);
      bit.style.setProperty("--r", `${Math.random() * 360}deg`);
      bit.style.setProperty("--w", `${6 + Math.random() * 7}px`);
      bit.style.setProperty("--h", `${10 + Math.random() * 10}px`);
      box.appendChild(bit);
    }
  }
};

applyBingoSet("pop");

const WHEEL_COLORS = ["#e22540", "#1368ce", "#d89e00", "#26890c", "#8b5cf6", "#ec4899", "#22d3ee", "#facc15"];

function wheelSets() {
  return t("wheel.sets");
}

let WHEEL_PRIZES = [];
const wheelDisc = $("#wheelDisc");

function applyWheelSet(id) {
  const set = wheelSets()[id] || wheelSets().prizes;
  WHEEL_PRIZES = set.labels.map((label, i) => ({
    label,
    color: WHEEL_COLORS[i % WHEEL_COLORS.length]
  }));
  $$("[data-wheel-set]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.wheelSet === id);
  });
  $("#wheelResult").textContent = set.title;
  paintWheel();
  wheelAngle = 0;
  wheelDisc.style.transform = "rotate(0deg)";
}

function paintWheel() {
  const n = WHEEL_PRIZES.length;
  wheelDisc.style.background = `conic-gradient(${WHEEL_PRIZES.map((p, i) => {
    const a = (360 / n) * i;
    const b = (360 / n) * (i + 1);
    return `${p.color} ${a}deg ${b}deg`;
  }).join(", ")})`;
  wheelDisc.innerHTML = WHEEL_PRIZES.map((p, i) => {
    const slice = 360 / n;
    const rot = i * slice + slice / 2;
    const dark = p.color === "#facc15" || p.color === "#22d3ee" || p.color === "#d89e00";
    return `<div class="wheel-slice" style="transform:rotate(${rot}deg);color:${dark ? "#111" : "#fff"}">${p.label}</div>`;
  }).join("") + '<div class="wheel-hub"></div>';
}

let wheelAngle = 0;
let wheelBusy = false;
applyWheelSet("prizes");
function spinWheel() {
  if (wheelBusy) return;
  wheelBusy = true;
  const spinBtn = $("#wheelSpin");
  if (spinBtn) spinBtn.disabled = true;
  const n = WHEEL_PRIZES.length;
  const slice = 360 / n;
  const index = Math.floor(Math.random() * n);
  const center = index * slice + slice / 2;
  const landing = (360 - center) % 360;
  const current = ((wheelAngle % 360) + 360) % 360;
  const delta = (landing - current + 360) % 360;
  const start = wheelAngle;
  const end = wheelAngle + 6 * 360 + delta;
  const duration = reducedMotion ? 400 : 3800;
  const t0 = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;
  function frame(now) {
    const p = Math.min(1, (now - t0) / duration);
    wheelAngle = start + (end - start) * ease(p);
    wheelDisc.style.transform = `rotate(${wheelAngle}deg)`;
    if (p < 1) {
      requestAnimationFrame(frame);
      return;
    }
    $("#wheelResult").textContent = WHEEL_PRIZES[index].label;
    $("#demoBoard").classList.add("is-win");
    wheelBusy = false;
    if (spinBtn) spinBtn.disabled = false;
    setTimeout(() => $("#demoBoard").classList.remove("is-win"), 1600);
  }
  requestAnimationFrame(frame);
}

const modal = $("#experienceModal");
const experienceVideo = $("#experienceVideo");

function stopExperienceVideo() {
  if (!experienceVideo) return;
  experienceVideo.pause();
  experienceVideo.currentTime = 0;
}

function goToDemo(name) {
  stopExperienceVideo();
  modal.close();
  playDemo(name);
}

$("#openExperience").onclick = () => {
  modal.showModal();
  if (!experienceVideo) return;
  experienceVideo.currentTime = 0;
  experienceVideo.play().catch(() => {});
};

$("#experienceClose").onclick = () => {
  stopExperienceVideo();
  modal.close();
};

modal.addEventListener("close", stopExperienceVideo);

const bioModal = $("#bioModal");
$("#openBio").onclick = () => bioModal?.showModal();
$("#bioClose").onclick = () => bioModal?.close();
bioModal?.addEventListener("click", (e) => {
  if (e.target === bioModal) bioModal.close();
});

$("#liveSkip").onclick = () => goToDemo("bingo");
$("#liveCta").onclick = (e) => {
  e.preventDefault();
  goToDemo("quiz");
};

$$(".service-card[data-demo]").forEach((card) => {
  card.style.cursor = "pointer";
  card.onclick = () => playDemo(card.dataset.demo);
});

$$(".service-card[data-href]").forEach((card) => {
  card.style.cursor = "pointer";
  card.onclick = () => {
    const target = document.querySelector(card.dataset.href);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
});

function applyStaticI18n() {
  $$("[data-i18n]").forEach((el) => {
    const val = t(el.dataset.i18n);
    if (val == null || typeof val === "object") return;
    el.textContent = val;
  });
  $$("[data-i18n-html]").forEach((el) => {
    const val = t(el.dataset.i18nHtml);
    if (val == null) return;
    el.innerHTML = val;
  });
  $$("[data-i18n-aria]").forEach((el) => {
    const val = t(el.dataset.i18nAria);
    if (val == null) return;
    el.setAttribute("aria-label", val);
  });
  $$("[data-i18n-alt]").forEach((el) => {
    const val = t(el.dataset.i18nAlt);
    if (val == null) return;
    el.setAttribute("alt", val);
  });
  const alts = t("photos.alts");
  if (Array.isArray(alts)) {
    $$("#photoShow img").forEach((img, i) => {
      if (alts[i]) img.alt = alts[i];
    });
  }
  const title = t("meta.title");
  if (title) document.title = title;
  const desc = t("meta.description");
  const meta = document.querySelector('meta[name="description"]');
  if (desc && meta) meta.setAttribute("content", desc);
}

function applyLanguage(lang) {
  currentLang = lang === "en" ? "en" : "fr";
  localStorage.setItem(LANG_KEY, currentLang);
  document.documentElement.lang = currentLang;
  applyStaticI18n();
  $$(".lang-btn").forEach((btn) => {
    const on = btn.dataset.lang === currentLang;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const quizId = $("[data-quiz-set].is-on")?.dataset.quizSet || "funny";
  applyQuizSet(quizId);
  const bingoId = $("[data-bingo-set].is-on")?.dataset.bingoSet || "pop";
  applyBingoSet(bingoId);
  const wheelId = $("[data-wheel-set].is-on")?.dataset.wheelSet || "prizes";
  applyWheelSet(wheelId);
  setExperience(timelineStep);
  applyEvent($(".event-tab.active")?.dataset.event || "mariage", false);
  renderReviews();
  document.documentElement.classList.remove("i18n-pending");
}

$$(".lang-btn").forEach((btn) => {
  btn.onclick = () => applyLanguage(btn.dataset.lang);
});

applyLanguage(currentLang);

const spotlight = $("#spotlight");
if (!reducedMotion && spotlight && window.matchMedia("(pointer:fine)").matches) {
  window.addEventListener("pointermove", (e) => {
    spotlight.style.left = `${e.clientX}px`;
    spotlight.style.top = `${e.clientY}px`;
  }, { passive: true });
}

(function lights() {
  const canvas = $("#stageCanvas");
  if (!canvas || reducedMotion) return;
  const ctx = canvas.getContext("2d");
  const spots = [
    { x: 0.18, y: 0.2, r: 320, color: "139,92,246", speed: 0.00022 },
    { x: 0.82, y: 0.28, r: 300, color: "236,72,153", speed: 0.00018 },
    { x: 0.55, y: 0.78, r: 340, color: "34,211,238", speed: 0.00014 },
    { x: 0.4, y: 0.45, r: 220, color: "250,204,21", speed: 0.00026 }
  ];
  const particles = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: 0.6 + Math.random() * 2.2,
    v: 0.0001 + Math.random() * 0.00032
  }));

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const beat = 0.7 + Math.sin(now / 280) * 0.3;
    spots.forEach((sp, i) => {
      const x = (sp.x + Math.sin(now * sp.speed + i) * 0.1) * canvas.width;
      const y = (sp.y + Math.cos(now * sp.speed * 0.8 + i) * 0.08) * canvas.height;
      const g = ctx.createRadialGradient(x, y, 0, x, y, sp.r * beat);
      g.addColorStop(0, `rgba(${sp.color},${0.18 * beat})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, sp.r * beat, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    particles.forEach((p) => {
      p.y -= p.v * 16;
      if (p.y < 0) p.y = 1;
      ctx.globalAlpha = 0.14 + p.s * 0.1;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, p.s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
