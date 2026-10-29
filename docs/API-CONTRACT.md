# Shared API contract — 2026-10-29
All endpoints under /api. JSON unless upload. Errors {error:string}. Auth cookie sessions, same-origin. Shared shapes in shared/types.ts. No paid providers; Ollama optional loopback only. GET methods never mutate external websites.

POST /auth/register {name,email,password} -> {user}; first account local admin.
POST /auth/login {email,password} -> {user}; POST /auth/logout -> {ok:true}; GET /auth/me -> {user} or 401.
GET /bootstrap -> Bootstrap
GET /profile -> Profile; PUT /profile -> Profile (fields as shared type)
GET /jobs?q=&remote=&source=&saved=&limit=100 -> {jobs:Job[],total:number}
GET /jobs/:id -> {job:Job}
POST /discovery/run -> {run:Run}; asynchronous real collection; GET /discovery/runs -> {runs:Run[]}; client polls while running.
GET /applications -> {applications:Application[]}; POST /applications {jobId,status} -> {application}; PATCH /applications/:id {status?,notes?} -> {application}; DELETE /applications/:id -> {ok:true} (unsave).
GET /resumes -> {resumes:Resume[]}; POST /resumes/upload multipart file (PDF/DOCX/TXT max 5MB) -> {resume}; POST /resumes/text {text,filename?} -> {resume}; PATCH /resumes/:id {text} -> {resume}; DELETE /resumes/:id -> {ok:true}.
POST /resumes/:id/analyze {jobId?} -> {resume} (explainable deterministic scoring always, optional local Ollama suggestions clearly identified; no fake inference)
PATCH /resumes/:id/suggestions/:suggestionId {status:'accepted'|'rejected'|'pending'} -> {resume}; only supplied before/after proposed by server; accept changes text only on exact matching before; restore pending supports undo.
GET /sources -> {sources:Source[]}; GET /settings -> {settings:Settings}; GET /ai/status -> {available,model,message}
ADMIN: GET /admin -> {users:User[],sources:Source[],runs:Run[],settings:Settings}; PATCH /admin/settings fields -> {settings}; POST /admin/sources {name,type,slug,enabled} -> {source}; PATCH /admin/sources/:id {enabled?,name?,slug?} -> {source}; DELETE /admin/sources/:id -> {ok:true}. admin role required.
POST /extension/token -> {token:string} explicit issue, hashed at rest; GET /extension/profile bearer token -> profile basic fields only. Extension endpoints CORS chrome-extension only; no general permissive credential CORS.
GET /health -> {ok:true} no private data.

DELETE /extension/token revokes the current connection token. GET /extension/profile responds {profile:{name,email,phone,location,website,linkedin}}; no resume/notes/full account data is exposed to the assistant. Job.available=false means absent from the latest bounded source response, not confirmed closed; excluded from discovery and retained in tracked history.
