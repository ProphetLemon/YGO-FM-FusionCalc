let nameInput = document.getElementById("cardname");
let outputLeft = document.getElementById("output-area-left");
let outputRight = document.getElementById("output-area-right");
let outputCard = document.getElementById("outputcard");
let searchMessage = document.getElementById("search-msg");
let resetBtn = document.getElementById("reset-btn");
let searchResultsBtn = document.getElementById("search-results-btn");
let searchNameBtn = document.getElementById("search-name-btn");

// FUNCTIONS

function resultsClear() {
    outputLeft.innerHTML = "";
    outputRight.innerHTML = "";
    outputCard.innerHTML = "";
    searchMessage.innerHTML = "";
}

function createDangerMessage(input) {
    var msg = !input ? "Please enter a search term" : "No card for " + input + " found";
    return (
        '<div class="block rounded p-3 bg-red-100 text-red-800 border border-red-300" role="alert">' +
        msg +
        "</div>"
    );
}

function createSideCard(card) {
    let modelCard = `<div class="block rounded-lg border border-fm-primary/30 bg-white shadow-sm ml-1" style="max-width: 540px">
                    <div class="flex flex-wrap gap-0">
                    <div class="flex-1">
                    <div class="p-4">
                    <h5 class="font-semibold text-base mb-2">${card.Name}</h5>
                    <p class="mb-2 text-sm">${card.Description}</p>
                    <p class="mb-2 text-sm"><strong>ATK / DEF:</strong> ${card.Attack} / ${card.Defense}</p>
                    <p class="mb-2 text-sm"><strong>Type:</strong> ${cardTypes[card.Type]}</p>
                    <p class="mb-2 text-sm"><strong>Stars:</strong> ${card.Stars}</p>
                    <p class="mb-2 text-sm"><strong>Password:</strong> ${card.CardCode}</p>
                    </div>
                    </div>
                    </div>
                  </div>`;

    if (card.Type < 20) {
        return modelCard;
    } else {
        let notMonsterCard = modelCard.replace(
            `<p class="mb-2 text-sm"><strong>ATK / DEF:</strong> ${card.Attack} / ${card.Defense}</p>`,
            ""
        );
        return notMonsterCard;
    }
}

// Initialize awesomplete
var cardNameCompletion = new Awesomplete(nameInput, {
    list: card_db()
        .get()
        .map((c) => c.Name), // list is all the cards in the DB
    autoFirst: true, // The first item in the list is selected
    filter: Awesomplete.FILTER_STARTSWITH, // case insensitive from start of word
});
$("#cardname").on("change", function () {
    cardNameCompletion.select(); // select the currently highlighted item, e.g. if user tabs
    resultsClear();
    searchByName();
});
$("#cardname").on("awesomplete-selectcomplete", function () {
    resultsClear();
    searchByName();
});

// Creates a div for each fusion
function fusesToHTML(fuselist) {
    return fuselist.map(function (fusion) {
        var res = `<div class="block rounded-lg border border-black bg-white shadow-sm mb-3" style="max-width: 18rem;">
        <div class="p-4 text-fm-primary"><p class="mb-2 text-sm"><strong>Input:</strong> ${fusion.card1.Name}</p>
        <p class="mb-2 text-sm"><strong>Input:</strong> ${fusion.card2.Name}</p>`;
        if (fusion.result) {
            // Equips and Results don't have a result field
            res += `<p class="mb-2 text-sm"><strong>Result:</strong> ` + fusion.result.Name;
            res += " (" + fusion.result.Attack + "/" + fusion.result.Defense + ")</p>";
        }
        return res + `</div></div>`;
    });
}

// Returns the card with a given ID
function getCardById(id) {
    var card = card_db({ Id: id }).first();
    if (!card) {
        return null;
    }
    return card;
}

function searchByName() {
    if (nameInput.value === "") {
        searchMessage.innerHTML = createDangerMessage();
        return;
    } else {
        let card = card_db({ Name: { isnocase: nameInput.value } }).first();
        if (!card) {
            searchMessage.innerHTML = createDangerMessage(nameInput.value);
            return;
        } else {
            // Display card beside search bar
            outputCard.innerHTML = createSideCard(card);

            // Get the list of fusions and equips

            var fuses = card.Fusions.map((i) => {
                return { card1: card, card2: getCardById(i._card2), result: getCardById(i._result) };
            });
            var equips = equipsList[card.Id].map((e) => {
                return { card1: card, card2: getCardById(e) };
            });

            outputRight.innerHTML = "<h2 class='text-center my-4 font-display text-2xl'>Can be equiped</h2>";
            outputRight.innerHTML += fusesToHTML(equips);

            outputLeft.innerHTML = "<h2 class='text-center my-4 font-display text-2xl'>Fusions</h2>";
            outputLeft.innerHTML += fusesToHTML(fuses);
        }
    }
}

function searchForResult() {
    if (nameInput.value === "") {
        searchMessage.innerHTML = createDangerMessage();
        return;
    } else {
        var card = card_db({ Name: { isnocase: nameInput.value } }).first();
        if (!card) {
            searchMessage.innerHTML = createDangerMessage(nameInput.value);
            return;
        } else {
            // Display card beside search bar
            outputCard.innerHTML = createSideCard(card);

            if (resultsList[card.Id].length > 0) {
                var results = resultsList[card.Id].map((f) => {
                    return { card1: getCardById(f.card1), card2: getCardById(f.card2) };
                });
                outputLeft.innerHTML = "<h2 class='text-center my-4 font-display text-2xl'>Fusions</h2>";
                outputLeft.innerHTML += fusesToHTML(results);
            }
        }
    }
}

searchNameBtn.onclick = function () {
    cardNameCompletion.select(); // select the currently highlighted item
    resultsClear();
    searchByName();
};

searchResultsBtn.onclick = function () {
    cardNameCompletion.select(); // select the currently highlighted item
    resultsClear();
    searchForResult();
};

resetBtn.onclick = function () {
    resultsClear();
    nameInput.value = "";
};
