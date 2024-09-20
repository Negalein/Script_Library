/*******************************************************************************
 Autor: OliverIO (ioBroker Forum)
 ******************************************************************************/



var xml2js = require('xml2js');
var fetch = require('node-fetch');
const useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
let savedEinsaetzeDP = "0_userdata.0.FF-Einsatz.Await";
 
async function getData() {
    const response = await fetch("https://cf-einsaetze.ooelfv.at/webext2/rss/webext2_laufend.xml", {
        "headers": {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "User-Agent": useragent
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET"
    });
    let text = await response.text();
    return text;
}
async function xml2json(xml) {
    return new Promise(function (resolve, reject) {
        var parser = new xml2js.Parser(
            {
                explicitArray: false
            }
        );
        parser.parseString(xml, function (err, result) {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
        // xml2js.parseString(xml, function (err, result) {
        // });
    })
    // var parser = new xml2js.Parser();
    // parser.parseString(xml, function (err, result) {
    //     console.dir(result);
    // });
}
function normalizeData(obj) {
    let a = 1;
    let einsaetze = [];
    for (let i = 0; i < obj.length; i++) {
        let einsatz = obj[i];
        let einsatzNeu = {
            id: einsatz.$.id,
            startzeit: einsatz.startzeit,
            status: einsatz.status,
            alarmstufe: einsatz.alarmstufe,
            einsatzart: einsatz.einsatzart,
            einsatzorg: einsatz.einsatzorg,
            einsatztyp: einsatz.einsatztyp._,
            einsatzsubtyp: einsatz.einsatzsubtyp._,
            alarmtext: einsatz.alarmtext,
            earea: einsatz.adresse.earea,
            bezirk_name: einsatz.bezirk._,
            bezirk_id: einsatz.bezirk.$.id,
            lng: einsatz.lng,
            lat: einsatz.lat,
            einheiten: []
        };
        if (Array.isArray(einsatz.einheiten.einheit) == false) {
            einsatz.einheiten.einheit = [einsatz.einheiten.einheit];
        }
        for (let j = 0; j < einsatz.einheiten.einheit.length; j++) {
            let einheit = einsatz.einheiten.einheit[j];
            einsatzNeu.einheiten.push({
                id: einheit.$.id,
                bezeichnung: einheit._
            })
        }
        einsaetze.push(einsatzNeu);
    }
    return einsaetze;
}
function filterEinheiten(einsaetze, einheiten) {
    if (!einheiten) throw Error("Einheiten ids müssen angegeben werden");
    return einsaetze.filter(einsatz => einheiten.some(id => einsatz.einheiten.some(einheit => einheit.id == id)));
}
function filterBezirk(einsaetze, bezirk) {
    if (!bezirk) throw Error("bezirkid muss angegeben werden");
    return einsaetze.filter(einsatz => einsatz.bezirk_id == bezirk);
}
function toHtml(einsaetze) {
    let rows = "";
    einsaetze.forEach(einsatz => {
        let einheiten = einsatz.einheiten.map(einheit => einheit.bezeichnung).join("<br>");
        rows += `
            <tr>
                <td>${einsatz.alarmstufe}</td>
                <td>${einsatz.alarmtext}</td>
                <td>${einheiten}</td>
                <td>${einsatz.earea}</td>
                <td>${einsatz.lat}</td>
                <td>${einsatz.lng}</td>
            </tr>
        `
    })
    let html = `
    <table>
      <tr>
        <th>Alarmstufe</th>
        <th>Alarmtext</th>
        <th>Einheiten</th>
        <th>EAREA</th>
        <th>lat</th>
        <th>lng</th>
      </tr>
      ${rows}
    </table>
    `;
 
    return html;
}
async function prepareMessages(einsaetze, kurz, alle) {
    let messages = [];
    const dateOptions = {
        weekday: "long",
    };
    const timeOptions = { hour: "2-digit", minute: "2-digit" };
    let data = await getStateAsync(savedEinsaetzeDP);
    let einsaetzeGesendet = JSON.parse(data.val || "[]");
    einsaetze.map(einsatz => {
        if (!einsaetzeGesendet.some(el => el.id == einsatz.id) || alle) {
            //if (!einsaetzeGesendet.includes(einsatz.id) || alle) {
            if (kurz) {
                messages.push(['Achtung;Feuerwehreinsatz in ', einsatz.earea, ';', 'Alarmstufe ', einsatz.alarmstufe, ';', einsatz.einsatzsubtyp, ';'].join(''));
            } else {
                messages.push(['Achtung;Feuerwehreinsatz in ', einsatz.earea, ';', 'Alarmstufe ', einsatz.alarmstufe, ';', einsatz.einsatzsubtyp, ';', 'Bezirk ', einsatz.bezirk_name, ';Anzahl Feuerwehren ', einsatz.einheiten.length, ';'].join(''));
            }
            einsaetzeGesendet.push({ id: einsatz.id, time: new Date() });
        }
    })
    await setStateAsync(savedEinsaetzeDP, JSON.stringify(einsaetzeGesendet));
    return messages.join(";");
}
function sendTelegram(text, user) {
    sendTo("telegram.0", "send", {
        text: text.replace(/;/gm, "\n"),
        user: user,
    });
}
function sendEMail(text, to, subject) {
    sendTo("email.0", "send", {
        text: text.replace(/;/gm, "\n"),
        to: to,
        subject: subject
    });
}
function sendAlexa(text, lautstaerke) {
    setState('alexa2.0.Echo-Devices.G2A0XL07022603EU.Commands.speak-volume', lautstaerke);
    setState('alexa2.0.Echo-Devices.G2A0XL07022603EU.Commands.speak', text,);
}

 
async function main() {
    let xml = await getData()
    let json = await xml2json(xml);
    let einsaetze = normalizeData(json.webext2.einsaetze.einsatz);
    let einsaetze_einheiten = filterEinheiten(einsaetze, [410321, 410327]);
    let einsaetze_bezirk = filterBezirk(einsaetze,10);
    let html1 = toHtml(einsaetze_einheiten);
    let html2 = toHtml(einsaetze_bezirk);
    let html3 = toHtml(einsaetze);
    let messages = await prepareMessages(einsaetze_bezirk, false, false);
    //messages = await prepareMessages(einsaetze, true, false);
    let nachtruhe=compareTime("01:00", "06:00","between");
    if (!nachtruhe || messages) sendAlexa(messages, 60);
    if (messages) sendTelegram(messages, "");
    if (messages) sendEMail(messages, "christian@nega.at", "Neuer Feuerwehreinsatz");
    //console.log(html1);
    //console.log(html2);
    //console.log(html3);
    //setState("0_userdata.0.testFolder.a", html3);
	setState("0_userdata.0.FF-Einsatz.Bezirk", html2);	
}
schedule('*/30 * * * * *',main)
