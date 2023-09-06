import * as htmlPdf from "html-pdf-chrome";
import { renderMinutes, createStyleHeader } from "./render-minutes";
import { app, query, sparqlEscapeString, uuid as generateUuid } from "mu";
import { createFile, FileMeta, FileMetaNoUri } from "./file";
import { STORAGE_PATH, STORAGE_URI } from "./config";
import sanitizeHtml from "sanitize-html";

export interface Meeting {
  plannedStart: Date;
  numberRepresentation: number;
}

export interface Person {
  firstName: string;
  lastName: string;
}

export type Secretary = {
  person: Person;
  title: string;
}

async function generatePdf(part: string, meeting: Meeting, secretary: Secretary): Promise<FileMeta> {
  const options: htmlPdf.CreateOptions = {
    host: "chrome-browser",
    port: 9222,
  };

  const uuid = generateUuid();
  const fileName = `${uuid}.pdf`;
  const filePath = `${STORAGE_PATH}/${fileName}`;

  const html = renderMinutes(part, meeting, secretary);
  const pdf = await htmlPdf.create(`${createStyleHeader()}${html}`, options);
  const fileMeta: FileMetaNoUri = {
    name: fileName,
    extension: "pdf",
    size: pdf.toBuffer().buffer.byteLength,
    created: new Date(),
    format: "application/pdf",
    id: uuid,
  };

  await pdf.toFile(filePath);

  return await createFile(fileMeta, `${STORAGE_URI}${fileMeta.name}`);
}

async function retrieveMinutesPart(minutesId: string): Promise<string | null> {
  const reportQuery = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX pav: <http://purl.org/pav/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  SELECT * WHERE {
    ?s mu:uuid ${sparqlEscapeString(minutesId)} .
    ?s a ext:Notulen .
 	  ?piecePart dct:isPartOf ?s .
    ?piecePart prov:value ?value .
    FILTER(NOT EXISTS { [] pav:previousVersion ?piecePart }) .
  }
  `;

  const {
    results: { bindings },
  } = await query(reportQuery);
  if (bindings.length === 0) {
    return null;
  }

  return bindings[0].value.value;
}

async function retrieveMeeting(minutesId: string): Promise<Meeting> {
  const dataQuery = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  SELECT DISTINCT ?numberRepresentation ?geplandeStart WHERE {
    ?minutes mu:uuid ${sparqlEscapeString(minutesId)} .
    ?minutes a ext:Notulen .
    ?minutes ^besluitvorming:heeftNotulen ?meeting .
    ?meeting ext:numberRepresentation ?numberRepresentation .
    ?meeting besluit:geplandeStart ?geplandeStart .
  }
  `;
  const {
    results: {
      bindings: [{ numberRepresentation, geplandeStart }],
    },
  } = await query(dataQuery);
  return {
    plannedStart: new Date(geplandeStart.value),
    numberRepresentation: numberRepresentation.value,
  };
}

async function retrieveSecretary(minutesId: string): Promise<Secretary> {
  const dataQuery = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX persoon: <https://data.vlaanderen.be/ns/persoon#>

  SELECT DISTINCT ?lastName ?firstName ?title WHERE {
    ?minutes mu:uuid ${sparqlEscapeString(minutesId)} .
    ?minutes a ext:Notulen .
    ?minutes ^besluitvorming:heeftNotulen ?meeting .
    ?meeting ext:secretarisVoorVergadering ?mandatee .
    ?mandatee dct:title ?title .
    ?mandatee mandaat:isBestuurlijkeAliasVan ?person .
    ?person foaf:familyName ?lastName .
    ?person persoon:gebruikteVoornaam ?firstName .
  }
  `;
  const queryResult = await query(dataQuery);
  if (queryResult.results && queryResult.results.bindings && queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return {
      person: {
        firstName: result.firstName.value,
        lastName: result.lastName.value,
      },
      title: result.title.value,
    };
  }
  return;
}


app.get("/:id", async function (req, res) {
  try {
    const minutesPart = await retrieveMinutesPart(req.params.id);
    if (!minutesPart) {
      res.status(500);
      res.send(`No minutes with id "${req.params.id}" found.`);
      return;
    }

    const meeting = await retrieveMeeting(req.params.id);
    if (!meeting) {
      res.status(500);
      res.send("Could not find meeting related to minutes.");
      return;
    }

    const secretary = await retrieveSecretary(req.params.id);
    if (!secretary) {
      res.status(500);
      res.send("Could not find secretary related to meeting")
    }

    const sanitizedPart = sanitizeHtml(minutesPart, sanitizeHtml.defaults);
    const fileMeta = await generatePdf(sanitizedPart, meeting, secretary);
    res.send(fileMeta);
  } catch (e) {
    res.status(500);
    console.error(e);
    res.send(e);
  }
});
