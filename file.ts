import {
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeInt,
  sparqlEscapeDateTime,
  update,
} from "mu";

export interface FileMeta {
  name: string;
  id: string;
  format: string;
  size: number;
  extension: string;
  created: Date;
  uri: string;
}

export type PhysicalFile = FileMeta;

export type VirtualFile = FileMeta & { physicalFile: PhysicalFile };

const createFile = async function (file: VirtualFile) {
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

  INSERT DATA {
      ${sparqlEscapeUri(file.uri)} a nfo:FileDataObject ;
            nfo:fileName ${sparqlEscapeString(file.name)} ;
            mu:uuid ${sparqlEscapeString(file.id)} ;
            dct:format ${sparqlEscapeString(file.format)} ;
            nfo:fileSize ${sparqlEscapeInt(file.size)} ;
            dbpedia:fileExtension ${sparqlEscapeString(file.extension)} ;
            dct:created ${sparqlEscapeDateTime(file.created)} ;
            dct:modified ${sparqlEscapeDateTime(file.created)} .
      ${sparqlEscapeUri(file.physicalFile.uri)} a nfo:FileDataObject ;
            nie:dataSource ${sparqlEscapeUri(file.uri)} ;
            nfo:fileName ${sparqlEscapeString(file.physicalFile.name)} ;
            mu:uuid ${sparqlEscapeString(file.physicalFile.id)} ;
            dct:format ${sparqlEscapeString(file.physicalFile.format)} ;
            nfo:fileSize ${sparqlEscapeInt(file.physicalFile.size)} ;
            dbpedia:fileExtension ${sparqlEscapeString(file.physicalFile.extension)} ;
            dct:created ${sparqlEscapeDateTime(file.physicalFile.created)} ;
            dct:modified ${sparqlEscapeDateTime(file.physicalFile.created)} .
  }`;
  await update(q);
};

export { createFile };
