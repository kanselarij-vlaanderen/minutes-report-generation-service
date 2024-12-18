import { renderMinutes, createStyleHeader } from "./render-minutes";
import {
  app,
  query,
  update,
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
  uuid as generateUuid
} from "mu";
import { createFile, FileMeta, PhysicalFile, VirtualFile } from "./file";
import {
  FILE_RESOURCE_BASE,
  STORAGE_PATH,
  MEETING_KINDS,
  ENABLE_DEBUG_WRITE_GENERATED_HTML,
} from "./config";
import sanitizeHtml from "sanitize-html";
import * as fs from "fs";
import fetch from "node-fetch";

export interface MinutesContext {
  plannedStart: Date;
  numberRepresentation: number;
  kind: string;
  kindLabel: string;
  minutesName: string;
}

export type File = {
  id: string;
}

export interface Person {
  firstName: string;
  lastName: string;
}

export type Secretary = {
  person: Person;
  title: string;
};

function generateMinutesFileName(context: MinutesContext): string {
  return `${context.minutesName}.pdf`.replace('/', '-');
}

async function generatePdf(
  part: string,
  context: MinutesContext,
  secretary: Secretary | undefined
): Promise<FileMeta> {
  const html = renderMinutes(part, context, secretary);
  const htmlString = `${createStyleHeader()}${html}`;
  if (ENABLE_DEBUG_WRITE_GENERATED_HTML) {
    fs.writeFileSync(
      '/debug/rendered_minutes.html',
      htmlString
    );
  }

  const response = await fetch("http://html-to-pdf/generate", {
    method: "POST",
    headers: {
      "Content-Type": "text/html",
    },
    body: htmlString,
  });

  if (response.ok) {
    const buffer = await response.buffer();

    const now = new Date();
    const physicalUuid = generateUuid();
    const physicalName = `${physicalUuid}.pdf`;
    const filePath = `${STORAGE_PATH}/${physicalName}`;

    const physicalFile: PhysicalFile = {
      id: physicalUuid,
      uri: filePath.replace('/share/', 'share://'),
      name: physicalName,
      extension: "pdf",
      size: buffer.byteLength,
      created: now,
      format: "application/pdf",
    };

    const virtualUuid = generateUuid();
    const fileName = generateMinutesFileName(context);
    const file: VirtualFile = {
      id: virtualUuid,
      uri: `${FILE_RESOURCE_BASE}${virtualUuid}`,
      name: fileName,
      extension: "pdf",
      size: buffer.byteLength,
      created: now,
      format: "application/pdf",
      physicalFile,
    };
    fs.writeFileSync(filePath, buffer);
    await createFile(file);
    return file;
  } else {
    if (response.headers["Content-Type"] === "application/vnd.api+json") {
      const errorResponse = await response.json();
      console.log(
        "Rendering PDF returned the following error response: ",
        errorResponse
      );
    }
    throw new Error("Something went wrong while generating the pdf");
  }
}

async function deleteFile(requestHeaders, file: File) {
  try {
    const response = await fetch(`http://file/files/${file.id}`, {
      method: "delete",
      headers: requestHeaders,
    });
    if (!response.ok) {
      throw new Error(`Something went wrong while removing the file: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Could not delete file with id: ${file.id}. Error:`, error);
  }
}

async function retrieveOldFile(notulenId: string): Promise<File | null> {
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  select ?fileId WHERE {
    ?notulen mu:uuid ${sparqlEscapeString(notulenId)} .
    ?notulen a ext:Notulen .
    ?notulen prov:value ?file .
    ?file a nfo:FileDataObject .
    ?file mu:uuid ?fileId .
  }
  `;

  const queryResult = await query(queryString);
  if (queryResult.results?.bindings?.length) {
    const result = queryResult.results.bindings[0];
    return { id: result.fileId.value };
  }
  return null;
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
    ?piecePart prov:value ?htmlContent .
    FILTER(NOT EXISTS { [] pav:previousVersion ?piecePart }) .
  }
  `;

  const {
    results: { bindings },
  } = await query(reportQuery);
  if (bindings.length === 0) {
    return null;
  }

  return bindings[0].htmlContent.value;
}

async function retrieveContext(minutesId: string): Promise<MinutesContext> {
  const dataQuery = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX dct: <http://purl.org/dc/terms/>

  SELECT DISTINCT ?numberRepresentation ?geplandeStart ?kind ?kindLabel ?minutesName WHERE {
    ?minutes mu:uuid ${sparqlEscapeString(minutesId)} .
    ?minutes a ext:Notulen .
    ?minutes dct:title ?minutesName .
    ?minutes ^besluitvorming:heeftNotulen ?meeting .
    ?meeting ext:numberRepresentation ?numberRepresentation .
    ?meeting besluit:geplandeStart ?geplandeStart .
    ?meeting dct:type ?kind .
    ?kind skos:prefLabel ?kindLabel .
  }
  `;
  const {
    results: {
      bindings: [{ numberRepresentation, geplandeStart, kind, kindLabel, minutesName }],
    },
  } = await query(dataQuery);
  return {
    plannedStart: new Date(geplandeStart.value),
    numberRepresentation: numberRepresentation.value,
    kind: kind.value,
    kindLabel: kindLabel.value,
    minutesName: minutesName.value,
  };
}

async function retrieveSecretary(
  minutesId: string
): Promise<Secretary | undefined> {
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
  if (
    queryResult.results &&
    queryResult.results.bindings &&
    queryResult.results.bindings.length
  ) {
    const result = queryResult.results.bindings[0];
    return {
      person: {
        firstName: result.firstName.value,
        lastName: result.lastName.value,
      },
      title: result.title.value,
    };
  }
}

async function replaceMinutesFile(minutesId: string, fileUri: string) {
  const queryString = `
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  DELETE {
    ?minutes prov:value ?document .
    ?minutes dct:modified ?modified .
  } INSERT {
    ?minutes prov:value ${sparqlEscapeUri(fileUri)} .
    ?minutes dct:modified ${sparqlEscapeDateTime(new Date())}
  } WHERE {
    ?minutes mu:uuid ${sparqlEscapeString(minutesId)} .
    ?minutes a ext:Notulen .
    OPTIONAL { ?minutes prov:value ?document .}
    OPTIONAL { ?minutes dct:modified ?modified .}
  }
  `;
  await update(queryString);
}


async function retrieveSignFlowStatus(
  minutesId: string
): Promise<string | undefined> {
  const dataQuery = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT DISTINCT ?minutes ?signFlow ?status WHERE {
    ?minutes mu:uuid ${sparqlEscapeString(minutesId)}
    OPTIONAL {
      ?signMarkingActivity sign:gemarkeerdStuk ?minutes .
      ?signMarkingActivity sign:markeringVindtPlaatsTijdens ?signSubcase .
      ?signFlow sign:doorlooptHandtekening ?signSubcase .
      ?signFlow adms:status ?status .
    }
  }
  `;
  const queryResult = await query(dataQuery);
  if (
    queryResult.results &&
    queryResult.results.bindings &&
    queryResult.results.bindings.length
  ) {
    const result = queryResult.results.bindings[0];
    return result?.status?.value;
  }
}

app.get("/:id", async function (req, res) {
  try {
    const minutesPart = await retrieveMinutesPart(req.params.id);
    if (!minutesPart) {
      res.status(500);
      res.send(`No minutes with id "${req.params.id}" found.`);
      return;
    }

    const signFlowStatus = await retrieveSignFlowStatus(req.params.id);
    if (signFlowStatus && signFlowStatus !== "http://themis.vlaanderen.be/id/handtekenstatus/f6a60072-0537-11ee-bb35-ee395168dcf7") {
      res.status(500);
      res.send("Cannot edit minutes that have signatures.");
      return;
    }

    const meeting = await retrieveContext(req.params.id);
    if (!meeting) {
      res.status(500);
      res.send("Could not find meeting related to minutes.");
      return;
    }

    const secretary = await retrieveSecretary(req.params.id);
    const oldFile = await retrieveOldFile(req.params.id);

    const sanitizeOptions = {
      ...sanitizeHtml.defaults,
      allowedAttributes: {
        section: [
          {
            name: 'data-section',
            values: ['announcements', 'attendees', 'absentees', 'next-meeting',]
          }
        ],
        '*': ['data-indentation-level'],
        'ol': ['style', 'data-hierarchical', 'data-list-style'],
        'li': ['data-list-marker'],
      },
      allowedStyles: {
        'ol': {
          'list-style-type': [/.*/]
        }
      }
    }
    const sanitizedPart = sanitizeHtml(minutesPart, sanitizeOptions);
    // Fix for list markers not being rendered correctly (regarding spacing) in the pdf
    const fixedPart = sanitizedPart.replace(/data-list-marker="([^"]*) "/g, 'data-list-marker="$1&nbsp;"');
    const fileMeta = await generatePdf(fixedPart, meeting, secretary);
    if (fileMeta) {
      await replaceMinutesFile(req.params.id, fileMeta.uri);
      if (oldFile) {
        await deleteFile(req.headers, oldFile);
      }
      return res.status(200).send(fileMeta);
    }
    throw new Error('Something went wrong while generating the pdf');
  } catch (e) {
    res.status(500);
    console.error(e);
    res.send(e);
  }
});
