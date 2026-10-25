/**
 * Local sentence embeddings and their storage (design: subsystem B).
 * Meta's Model API exposes no embeddings endpoint, so vectors are produced in-process by a
 * small sentence-transformer and stored in pgvector (migration 0702).
 */
export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, cosine, embed, embedOne, setExtractor } from './model';
export { profileText, sourceHash, tagText, type EmbeddableProfile } from './text';
export {
  getProfileEmbeddings,
  getProfileHashes,
  getTagEmbeddings,
  upsertProfileEmbeddings,
  upsertTagEmbeddings,
  type ProfileVector,
  type TagVector,
} from './store';
