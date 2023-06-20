import {
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeInt,
  sparqlEscapeDateTime,
  update,
  uuid as generateUuid,
} from "mu";
import { RESOURCE_BASE } from "./config";

export interface FileMeta {
  name: string;
  id: string;
  format: string;
  size: number;
  extension: string;
  created: Date;
  uri: string;
}

export type FileMetaNoUri = Omit<FileMeta, "uri"> & { uri?: string };

const createFile = async function (
  file: FileMetaNoUri,
  physicalUri: string
): Promise<FileMeta> {
  const uri = RESOURCE_BASE + `/files/${file.id}`;
  const physicalUuid = generateUuid();
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

  INSERT DATA {
      ${sparqlEscapeUri(uri)} a nfo:FileDataObject ;
            nfo:fileName ${sparqlEscapeString(file.name)} ;
            mu:uuid ${sparqlEscapeString(file.id)} ;
            dct:format ${sparqlEscapeString(file.format)} ;
            nfo:fileSize ${sparqlEscapeInt(file.size)} ;
            dbpedia:fileExtension ${sparqlEscapeString(file.extension)} ;
            dct:created ${sparqlEscapeDateTime(file.created)} ;
            dct:modified ${sparqlEscapeDateTime(file.created)} .
      ${sparqlEscapeUri(physicalUri)} a nfo:FileDataObject ;
            nie:dataSource ${sparqlEscapeUri(uri)} ;
            nfo:fileName ${sparqlEscapeString(
              `${physicalUuid}.${file.extension}`
            )} ;
            mu:uuid ${sparqlEscapeString(physicalUuid)} ;
            dct:format ${sparqlEscapeString(file.format)} ;
            nfo:fileSize ${sparqlEscapeInt(file.size)} ;
            dbpedia:fileExtension ${sparqlEscapeString(file.extension)} ;
            dct:created ${sparqlEscapeDateTime(file.created)} ;
            dct:modified ${sparqlEscapeDateTime(file.created)} .
  }`;
  await update(q);

  return {
    ...file,
    uri,
  };
};

export { createFile };
