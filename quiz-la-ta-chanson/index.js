const path = require("path");
const express = require("express");

const MODULE_DIR = __dirname;
const APP_DIR = path.join(MODULE_DIR, "app");
const PUBLIC_DIR = path.join(MODULE_DIR, "public");
const BASE_PATH = "/quiz-la-ta-chanson";
const LEGACY_BASE_PATH = "/on-connait-la-chanson";

function registerQuizLaTaChansonRoutes(app) {
  app.get(BASE_PATH, (req, res) => {
    res.redirect(302, `${BASE_PATH}/host`);
  });

  app.get(`${BASE_PATH}/menu`, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "launcher.html"));
  });

  app.get(`${BASE_PATH}/host`, (req, res) => {
    res.sendFile(path.join(APP_DIR, "host.html"));
  });

  app.get(`${BASE_PATH}/viewer`, (req, res) => {
    res.sendFile(path.join(APP_DIR, "viewer.html"));
  });

  app.get(`${BASE_PATH}/jeu`, (req, res) => {
    res.redirect(`${BASE_PATH}/viewer`);
  });

  app.get(`${BASE_PATH}/roue`, (req, res) => {
    res.sendFile(path.join(APP_DIR, "roue-principal.html"));
  });

  app.use(
    BASE_PATH,
    express.static(APP_DIR, {
      index: false,
      fallthrough: true
    })
  );

  app.all(/^\/on-connait-la-chanson(\/.*)?$/, (req, res) => {
    const suffix = req.path.slice(LEGACY_BASE_PATH.length);
    res.redirect(301, `${BASE_PATH}${suffix}`);
  });
}

function getStartupInfo(getBaseUrl) {
  return {
    moduleDir: MODULE_DIR,
    hostUrl: `${getBaseUrl()}${BASE_PATH}/host`,
    viewerUrl: `${getBaseUrl()}${BASE_PATH}/viewer`
  };
}

module.exports = {
  MODULE_DIR,
  BASE_PATH,
  registerQuizLaTaChansonRoutes,
  getStartupInfo
};
