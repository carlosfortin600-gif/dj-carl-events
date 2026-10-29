function q(id, text, pairs) {
  return {
    id,
    text,
    answers: pairs.map(([label, points]) => ({ text: label, points }))
  };
}

const PACKS = [
  {
    id: "party",
    name: "Le party",
    questions: [
      q("party", "Nommez quelque chose qu'on apporte à un party", [
        ["Chips", 28], ["Vin", 22], ["Bière", 18], ["Gâteau", 16], ["Glace", 16]
      ]),
      q("chanson", "Nommez une chanson de party que tout le monde connaît", [
        ["YMCA", 30], ["September", 22], ["Sweet Caroline", 18], ["I Gotta Feeling", 16], ["Le Freak", 14]
      ]),
      q("retard", "Nommez une excuse pour arriver en retard", [
        ["Le trafic", 36], ["Le réveil", 24], ["La météo", 16], ["Les enfants", 14], ["Le parking", 10]
      ]),
      q("voyage", "Nommez quelque chose qu'on oublie en voyage", [
        ["Chargeur", 32], ["Brosse à dents", 24], ["Médicaments", 16], ["Maillot", 14], ["Passeport", 14]
      ]),
      q("peur", "Nommez un animal qui fait peur", [
        ["Ours", 28], ["Serpent", 24], ["Araignée", 20], ["Requin", 16], ["Souris", 12]
      ]),
      q("crie", "Nommez quelque chose qu'on crie dans un party", [
        ["Santé", 30], ["Ohé", 22], ["Encore", 18], ["DJ", 16], ["Photo", 14]
      ]),
      q("metier", "Nommez un métier de rêve d'enfant", [
        ["Pompier", 26], ["Astronaute", 22], ["Docteur", 20], ["Chanteur", 18], ["Policier", 14]
      ]),
      q("minuit", "Nommez quelque chose qu'on mange après minuit", [
        ["Poutine", 34], ["Pizza", 24], ["Tacos", 16], ["Crème glacée", 14], ["Céréales", 12]
      ]),
      q("sport", "Nommez un sport qu'on regarde en gang", [
        ["Hockey", 40], ["Football", 24], ["Soccer", 16], ["Baseball", 12], ["Tennis", 8]
      ]),
      q("sac", "Nommez quelque chose dans un sac à main", [
        ["Clés", 28], ["Téléphone", 24], ["Portefeuille", 20], ["Baume", 14], ["Mouchoirs", 14]
      ]),
      q("camping", "Nommez quelque chose qu'on fait au camping", [
        ["Feu", 32], ["Guimauves", 22], ["Tente", 18], ["Chansons", 16], ["Pêche", 12]
      ]),
      q("danser", "Nommez une raison de se lever pour danser", [
        ["Un mariage", 28], ["La chanson", 24], ["Un verre de trop", 18], ["Le DJ insiste", 16], ["Pour quelqu'un", 14]
      ])
    ]
  },
  {
    id: "voyage",
    name: "En voyage",
    questions: [
      q("v1", "Nommez quelque chose dans une valise", [
        ["Vêtements", 32], ["Chargeur", 22], ["Souliers", 18], ["Trousse", 16], ["Caméra", 12]
      ]),
      q("v2", "Nommez un souvenir de voyage", [
        ["Carte postale", 28], ["Coquillage", 22], ["Aimant", 20], ["Photo", 18], ["T-shirt", 12]
      ]),
      q("v3", "Nommez ce qu'on fait à l'aéroport", [
        ["Attendre", 30], ["Sécurité", 24], ["Café", 18], ["Duty free", 16], ["Dormir", 12]
      ]),
      q("v4", "Nommez un problème en voyage", [
        ["Vol retardé", 34], ["Bagage perdu", 22], ["Météo", 18], ["La langue", 14], ["L'hôtel", 12]
      ]),
      q("v5", "Nommez quelque chose qu'on mange en vacances", [
        ["Crème glacée", 28], ["Fruits", 22], ["Poisson", 20], ["Hot-dog", 16], ["Crêpe", 14]
      ]),
      q("v6", "Nommez un moyen de transport en vacances", [
        ["Avion", 36], ["Auto", 24], ["Bateau", 16], ["Train", 14], ["Vélo", 10]
      ]),
      q("v7", "Nommez ce qu'on oublie avant de partir", [
        ["Barrer", 28], ["Les plantes", 22], ["Vider le frigo", 20], ["Le voisin", 16], ["Le courrier", 14]
      ]),
      q("v8", "Nommez une activité à la plage", [
        ["Nager", 32], ["Bronzer", 24], ["Château de sable", 18], ["Marcher", 14], ["Volleyball", 12]
      ]),
      q("v9", "Nommez un souvenir qu'on achète", [
        ["Aimant", 26], ["T-shirt", 24], ["Porte-clés", 20], ["Carte", 16], ["Chocolat", 14]
      ]),
      q("v10", "Nommez une raison de revenir plus tôt", [
        ["Maladie", 28], ["Météo", 24], ["L'argent", 20], ["On s'ennuie", 16], ["Le travail", 12]
      ]),
      q("v11", "Nommez ce qu'on met dans un bagage à main", [
        ["Téléphone", 30], ["Passeport", 26], ["Collation", 18], ["Écouteurs", 14], ["Livre", 12]
      ]),
      q("v12", "Nommez un endroit où on veut aller", [
        ["L'Europe", 28], ["Le Sud", 24], ["La plage", 20], ["La campagne", 16], ["La famille", 12]
      ])
    ]
  },
  {
    id: "maison",
    name: "À la maison",
    questions: [
      q("m1", "Nommez quelque chose qu'on fait le dimanche matin", [
        ["Brunch", 30], ["Dormir", 26], ["Café", 18], ["Ménage", 14], ["Le journal", 12]
      ]),
      q("m2", "Nommez ce qu'on cherche toujours à la maison", [
        ["Les clés", 32], ["La télécommande", 24], ["Les lunettes", 18], ["Le chargeur", 14], ["Un bas", 12]
      ]),
      q("m3", "Nommez une tâche qu'on remet à demain", [
        ["La vaisselle", 28], ["Le lavage", 24], ["La poussière", 18], ["Les courriels", 16], ["Les factures", 14]
      ]),
      q("m4", "Nommez quelque chose dans le frigo", [
        ["Le lait", 28], ["Des restes", 24], ["Un condiment", 18], ["De la bière", 16], ["Du fromage", 14]
      ]),
      q("m5", "Nommez ce qu'on fait quand on est seul", [
        ["La télé", 30], ["De la musique", 22], ["Une collation", 18], ["Une sieste", 16], ["Des textos", 14]
      ]),
      q("m6", "Nommez un bruit de maison la nuit", [
        ["Le frigo", 26], ["Le chauffage", 24], ["Le plancher", 20], ["Le chat", 16], ["Le vent", 14]
      ]),
      q("m7", "Nommez quelque chose qu'on répare avec du tape", [
        ["Un tuyau", 24], ["Un fil", 22], ["Un meuble", 20], ["Des lunettes", 18], ["Un pare-chocs", 16]
      ]),
      q("m8", "Nommez ce qu'on range avant une visite", [
        ["Le linge", 30], ["Les jouets", 24], ["La vaisselle", 20], ["Le courrier", 14], ["La litière", 12]
      ]),
      q("m9", "Nommez une raison de rester en pyjama", [
        ["Un férié", 28], ["On est malade", 24], ["Le télétravail", 20], ["La météo", 16], ["La paresse", 12]
      ]),
      q("m10", "Nommez quelque chose qu'on prête et qu'on ne revoit plus", [
        ["Un livre", 26], ["Un outil", 24], ["Un chargeur", 20], ["Un plat", 16], ["Un chandail", 14]
      ]),
      q("m11", "Nommez ce qu'on cuisine quand on n'a rien", [
        ["Des pâtes", 34], ["Des oeufs", 22], ["Un grilled cheese", 18], ["Des céréales", 14], ["Du pain doré", 12]
      ]),
      q("m12", "Nommez une pièce où on passe trop de temps", [
        ["La cuisine", 28], ["Le salon", 26], ["La chambre", 20], ["Le bureau", 14], ["La salle de bain", 12]
      ])
    ]
  },
  {
    id: "mariage",
    name: "Le mariage",
    questions: [
      q("w1", "Nommez quelque chose à un mariage", [
        ["La danse", 28], ["Le gâteau", 24], ["Un discours", 20], ["Les photos", 16], ["Le bouquet", 12]
      ]),
      q("w2", "Nommez une chanson de première danse", [
        ["Perfect", 24], ["At Last", 22], ["Thinking Out Loud", 20], ["All of Me", 18], ["Je t'aimais", 16]
      ]),
      q("w3", "Nommez ce qu'on lance au mariage", [
        ["Le bouquet", 36], ["Du riz", 22], ["Des confettis", 18], ["La jarretière", 14], ["Des pétales", 10]
      ]),
      q("w4", "Nommez une personne qui pleure", [
        ["La mère", 34], ["La mariée", 26], ["Le père", 16], ["La grand-mère", 14], ["Le témoin", 10]
      ]),
      q("w5", "Nommez quelque chose qu'on oublie le jour J", [
        ["Les alliances", 32], ["Les vœux", 22], ["Les souliers", 18], ["Le témoin", 16], ["Le maquillage", 12]
      ]),
      q("w6", "Nommez un endroit pour la réception", [
        ["Une salle", 30], ["Une grange", 22], ["Un jardin", 20], ["Un hôtel", 16], ["Un chalet", 12]
      ]),
      q("w7", "Nommez ce qu'on mange au buffet", [
        ["Du poulet", 24], ["De la salade", 22], ["Des patates", 20], ["Le dessert", 18], ["Les fromages", 16]
      ]),
      q("w8", "Nommez une raison d'être en retard à l'église", [
        ["La coiffure", 28], ["Le trafic", 24], ["La robe", 20], ["Le témoin", 16], ["Les photos", 12]
      ]),
      q("w9", "Nommez un cadeau de mariage", [
        ["De l'argent", 40], ["Un ensemble de cuisine", 20], ["De la vaisselle", 16], ["Un voyage", 14], ["Un cadre", 10]
      ]),
      q("w10", "Nommez ce que le DJ joue trop tard", [
        ["La Macarena", 26], ["YMCA", 24], ["Un cha-cha", 18], ["Un slow", 18], ["Les années 80", 14]
      ]),
      q("w11", "Nommez quelqu'un qui fait un discours trop long", [
        ["Le père", 28], ["Le témoin", 26], ["L'oncle", 18], ["Le frère", 16], ["Le patron", 12]
      ]),
      q("w12", "Nommez une tradition qu'on saute", [
        ["Le bouquet", 26], ["La jarretière", 24], ["Le gâteau en bouche", 20], ["L'ouverture du bal", 16], ["Le livre d'or", 14]
      ])
    ]
  },
  {
    id: "hiver",
    name: "L'hiver",
    questions: [
      q("h1", "Nommez quelque chose qu'on fait quand il neige", [
        ["Pelleter", 32], ["Rester dedans", 24], ["Raquette", 16], ["Glisser", 16], ["Une photo", 12]
      ]),
      q("h2", "Nommez un plat d'hiver", [
        ["Un ragoût", 28], ["Une soupe", 24], ["De la tourtière", 20], ["De la poutine", 16], ["Un chocolat chaud", 12]
      ]),
      q("h3", "Nommez ce qu'on porte à moins 30", [
        ["Un manteau", 30], ["Une tuque", 24], ["Un foulard", 18], ["Des mitaines", 16], ["Des bottes", 12]
      ]),
      q("h4", "Nommez une activité du temps des fêtes", [
        ["Le réveillon", 30], ["Les cadeaux", 26], ["Le patin", 16], ["La messe", 14], ["Un film", 14]
      ]),
      q("h5", "Nommez quelque chose qui brise l'hiver", [
        ["Le chauffe-moteur", 28], ["La batterie", 24], ["Un tuyau", 20], ["Le toit", 16], ["La serrure", 12]
      ]),
      q("h6", "Nommez ce qu'on apporte au chalet", [
        ["Du bois", 26], ["De la bouffe", 24], ["Des jeux", 18], ["Du vin", 18], ["Des couvertures", 14]
      ]),
      q("h7", "Nommez un sport d'hiver", [
        ["Le hockey", 40], ["Le ski", 22], ["Le patin", 16], ["La raquette", 12], ["La glissade", 10]
      ]),
      q("h8", "Nommez une excuse pour ne pas sortir", [
        ["Il fait trop froid", 36], ["La route", 22], ["On est bien", 18], ["La noirceur", 14], ["Demain", 10]
      ]),
      q("h9", "Nommez quelque chose dans un chocolat chaud", [
        ["Des guimauves", 36], ["De la crème", 22], ["De la cannelle", 16], ["De la liqueur", 14], ["Un bâton de bonbon", 12]
      ]),
      q("h10", "Nommez ce qu'on trouve dans l'auto l'hiver", [
        ["Une gratte", 32], ["Des câbles", 22], ["Une pelle", 18], ["Une couverture", 16], ["Du sel", 12]
      ]),
      q("h11", "Nommez une fête d'hiver au Québec", [
        ["Le Carnaval", 34], ["La cabane à sucre", 28], ["Noël", 16], ["Le jour de l'An", 12], ["La Saint-Valentin", 10]
      ]),
      q("h12", "Nommez quelque chose qu'on dit à la première neige", [
        ["Enfin", 24], ["Pas déjà", 24], ["C'est beau", 20], ["On reste ici", 18], ["Les pneus", 14]
      ])
    ]
  }
];

module.exports = { PACKS };
