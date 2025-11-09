#!/usr/bin/env node
import{Server as he}from"@modelcontextprotocol/sdk/server/index.js";import{StdioServerTransport as _e}from"@modelcontextprotocol/sdk/server/stdio.js";import{Client as fe}from"@modelcontextprotocol/sdk/client/index.js";import{StdioClientTransport as Ee}from"@modelcontextprotocol/sdk/client/stdio.js";import{CallToolRequestSchema as be,ListToolsRequestSchema as ge}from"@modelcontextprotocol/sdk/types.js";import{z as c}from"zod";import{zodToJsonSchema as Te}from"zod-to-json-schema";import{basename as Se}from"path";import pe from"better-sqlite3";import{join as L,dirname as ce,basename as xe}from"path";import{homedir as z}from"os";import{existsSync as De,mkdirSync as de}from"fs";import{fileURLToPath as le}from"url";function ue(){return typeof __dirname<"u"?__dirname:ce(le(import.meta.url))}var we=ue(),$=process.env.CLAUDE_MEM_DATA_DIR||L(z(),".claude-mem"),W=process.env.CLAUDE_CONFIG_DIR||L(z(),".claude"),ke=L($,"archives"),Fe=L($,"logs"),Ue=L($,"trash"),Me=L($,"backups"),je=L($,"settings.json"),B=L($,"claude-mem.db"),Z=L($,"vector-db"),Be=L(W,"settings.json"),Xe=L(W,"commands"),Pe=L(W,"CLAUDE.md");function X(i){de(i,{recursive:!0})}var P=class{db;constructor(e){e||(X($),e=B),this.db=new pe(e),this.db.pragma("journal_mode = WAL"),this.ensureFTSTables()}ensureFTSTables(){try{if(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'").all().some(r=>r.name==="observations_fts"||r.name==="session_summaries_fts"))return;console.error("[SessionSearch] Creating FTS5 tables..."),this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
          title,
          subtitle,
          narrative,
          text,
          facts,
          concepts,
          content='observations',
          content_rowid='id'
        );
      `),this.db.exec(`
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        SELECT id, title, subtitle, narrative, text, facts, concepts
        FROM observations;
      `),this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
          INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
          VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
        END;

        CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
          VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
        END;

        CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
          VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
          INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
          VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
        END;
      `),this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
          request,
          investigated,
          learned,
          completed,
          next_steps,
          notes,
          content='session_summaries',
          content_rowid='id'
        );
      `),this.db.exec(`
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        SELECT id, request, investigated, learned, completed, next_steps, notes
        FROM session_summaries;
      `),this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
          INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
          VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
        END;

        CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
          INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
          VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
        END;

        CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
          INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
          VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
          INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
          VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
        END;
      `),console.error("[SessionSearch] FTS5 tables created successfully")}catch(e){console.error("[SessionSearch] FTS migration error:",e.message)}}escapeFTS5(e){return`"${e.replace(/"/g,'""')}"`}buildFilterClause(e,t,r="o"){let s=[];if(e.project&&(s.push(`${r}.project = ?`),t.push(e.project)),e.type)if(Array.isArray(e.type)){let n=e.type.map(()=>"?").join(",");s.push(`${r}.type IN (${n})`),t.push(...e.type)}else s.push(`${r}.type = ?`),t.push(e.type);if(e.dateRange){let{start:n,end:o}=e.dateRange;if(n){let a=typeof n=="number"?n:new Date(n).getTime();s.push(`${r}.created_at_epoch >= ?`),t.push(a)}if(o){let a=typeof o=="number"?o:new Date(o).getTime();s.push(`${r}.created_at_epoch <= ?`),t.push(a)}}if(e.concepts){let n=Array.isArray(e.concepts)?e.concepts:[e.concepts],o=n.map(()=>`EXISTS (SELECT 1 FROM json_each(${r}.concepts) WHERE value = ?)`);o.length>0&&(s.push(`(${o.join(" OR ")})`),t.push(...n))}if(e.files){let n=Array.isArray(e.files)?e.files:[e.files],o=n.map(()=>`(
          EXISTS (SELECT 1 FROM json_each(${r}.files_read) WHERE value LIKE ?)
          OR EXISTS (SELECT 1 FROM json_each(${r}.files_modified) WHERE value LIKE ?)
        )`);o.length>0&&(s.push(`(${o.join(" OR ")})`),n.forEach(a=>{t.push(`%${a}%`,`%${a}%`)}))}return s.length>0?s.join(" AND "):""}buildOrderClause(e="relevance",t=!0,r="observations_fts"){switch(e){case"relevance":return t?`ORDER BY ${r}.rank ASC`:"ORDER BY o.created_at_epoch DESC";case"date_desc":return"ORDER BY o.created_at_epoch DESC";case"date_asc":return"ORDER BY o.created_at_epoch ASC";default:return"ORDER BY o.created_at_epoch DESC"}}searchObservations(e,t={}){let r=[],{limit:s=50,offset:n=0,orderBy:o="relevance",...a}=t,d=this.escapeFTS5(e);r.push(d);let l=this.buildFilterClause(a,r,"o"),h=l?`AND ${l}`:"",u=this.buildOrderClause(o,!0),p=`
      SELECT
        o.*,
        observations_fts.rank as rank
      FROM observations o
      JOIN observations_fts ON o.id = observations_fts.rowid
      WHERE observations_fts MATCH ?
      ${h}
      ${u}
      LIMIT ? OFFSET ?
    `;r.push(s,n);let f=this.db.prepare(p).all(...r);if(f.length>0){let m=Math.min(...f.map(E=>E.rank||0)),_=Math.max(...f.map(E=>E.rank||0))-m||1;f.forEach(E=>{E.rank!==void 0&&(E.score=1-(E.rank-m)/_)})}return f}searchSessions(e,t={}){let r=[],{limit:s=50,offset:n=0,orderBy:o="relevance",...a}=t,d=this.escapeFTS5(e);r.push(d);let l={...a};delete l.type;let h=this.buildFilterClause(l,r,"s"),m=`
      SELECT
        s.*,
        session_summaries_fts.rank as rank
      FROM session_summaries s
      JOIN session_summaries_fts ON s.id = session_summaries_fts.rowid
      WHERE session_summaries_fts MATCH ?
      ${(h?`AND ${h}`:"").replace(/files_read/g,"files_read").replace(/files_modified/g,"files_edited")}
      ${o==="relevance"?"ORDER BY session_summaries_fts.rank ASC":o==="date_asc"?"ORDER BY s.created_at_epoch ASC":"ORDER BY s.created_at_epoch DESC"}
      LIMIT ? OFFSET ?
    `;r.push(s,n);let b=this.db.prepare(m).all(...r);if(b.length>0){let _=Math.min(...b.map(T=>T.rank||0)),N=Math.max(...b.map(T=>T.rank||0))-_||1;b.forEach(T=>{T.rank!==void 0&&(T.score=1-(T.rank-_)/N)})}return b}findByConcept(e,t={}){let r=[],{limit:s=50,offset:n=0,orderBy:o="date_desc",...a}=t,d={...a,concepts:e},l=this.buildFilterClause(d,r,"o"),h=this.buildOrderClause(o,!1),u=`
      SELECT o.*
      FROM observations o
      WHERE ${l}
      ${h}
      LIMIT ? OFFSET ?
    `;return r.push(s,n),this.db.prepare(u).all(...r)}findByFile(e,t={}){let r=[],{limit:s=50,offset:n=0,orderBy:o="date_desc",...a}=t,d={...a,files:e},l=this.buildFilterClause(d,r,"o"),h=this.buildOrderClause(o,!1),u=`
      SELECT o.*
      FROM observations o
      WHERE ${l}
      ${h}
      LIMIT ? OFFSET ?
    `;r.push(s,n);let p=this.db.prepare(u).all(...r),f=[],m={...a};delete m.type;let b=[];if(m.project&&(b.push("s.project = ?"),f.push(m.project)),m.dateRange){let{start:N,end:T}=m.dateRange;if(N){let g=typeof N=="number"?N:new Date(N).getTime();b.push("s.created_at_epoch >= ?"),f.push(g)}if(T){let g=typeof T=="number"?T:new Date(T).getTime();b.push("s.created_at_epoch <= ?"),f.push(g)}}b.push(`(
      EXISTS (SELECT 1 FROM json_each(s.files_read) WHERE value LIKE ?)
      OR EXISTS (SELECT 1 FROM json_each(s.files_edited) WHERE value LIKE ?)
    )`),f.push(`%${e}%`,`%${e}%`);let _=`
      SELECT s.*
      FROM session_summaries s
      WHERE ${b.join(" AND ")}
      ORDER BY s.created_at_epoch DESC
      LIMIT ? OFFSET ?
    `;f.push(s,n);let E=this.db.prepare(_).all(...f);return{observations:p,sessions:E}}findByType(e,t={}){let r=[],{limit:s=50,offset:n=0,orderBy:o="date_desc",...a}=t,d={...a,type:e},l=this.buildFilterClause(d,r,"o"),h=this.buildOrderClause(o,!1),u=`
      SELECT o.*
      FROM observations o
      WHERE ${l}
      ${h}
      LIMIT ? OFFSET ?
    `;return r.push(s,n),this.db.prepare(u).all(...r)}searchUserPrompts(e,t={}){let r=[],{limit:s=20,offset:n=0,orderBy:o="relevance",...a}=t,d=this.escapeFTS5(e);r.push(d);let l=[];if(a.project&&(l.push("s.project = ?"),r.push(a.project)),a.dateRange){let{start:m,end:b}=a.dateRange;if(m){let _=typeof m=="number"?m:new Date(m).getTime();l.push("up.created_at_epoch >= ?"),r.push(_)}if(b){let _=typeof b=="number"?b:new Date(b).getTime();l.push("up.created_at_epoch <= ?"),r.push(_)}}let p=`
      SELECT
        up.*,
        user_prompts_fts.rank as rank
      FROM user_prompts up
      JOIN user_prompts_fts ON up.id = user_prompts_fts.rowid
      JOIN sdk_sessions s ON up.claude_session_id = s.claude_session_id
      WHERE user_prompts_fts MATCH ?
      ${l.length>0?`AND ${l.join(" AND ")}`:""}
      ${o==="relevance"?"ORDER BY user_prompts_fts.rank ASC":o==="date_asc"?"ORDER BY up.created_at_epoch ASC":"ORDER BY up.created_at_epoch DESC"}
      LIMIT ? OFFSET ?
    `;r.push(s,n);let f=this.db.prepare(p).all(...r);if(f.length>0){let m=Math.min(...f.map(E=>E.rank||0)),_=Math.max(...f.map(E=>E.rank||0))-m||1;f.forEach(E=>{E.rank!==void 0&&(E.score=1-(E.rank-m)/_)})}return f}getUserPromptsBySession(e){return this.db.prepare(`
      SELECT
        id,
        claude_session_id,
        prompt_number,
        prompt_text,
        created_at,
        created_at_epoch
      FROM user_prompts
      WHERE claude_session_id = ?
      ORDER BY prompt_number ASC
    `).all(e)}close(){this.db.close()}};import me from"better-sqlite3";var Y=(n=>(n[n.DEBUG=0]="DEBUG",n[n.INFO=1]="INFO",n[n.WARN=2]="WARN",n[n.ERROR=3]="ERROR",n[n.SILENT=4]="SILENT",n))(Y||{}),V=class{level;useColor;constructor(){let e=process.env.CLAUDE_MEM_LOG_LEVEL?.toUpperCase()||"INFO";this.level=Y[e]??1,this.useColor=process.stdout.isTTY??!1}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.level===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;try{let r=typeof t=="string"?JSON.parse(t):t;if(e==="Bash"&&r.command){let s=r.command.length>50?r.command.substring(0,50)+"...":r.command;return`${e}(${s})`}if(e==="Read"&&r.file_path){let s=r.file_path.split("/").pop()||r.file_path;return`${e}(${s})`}if(e==="Edit"&&r.file_path){let s=r.file_path.split("/").pop()||r.file_path;return`${e}(${s})`}if(e==="Write"&&r.file_path){let s=r.file_path.split("/").pop()||r.file_path;return`${e}(${s})`}return e}catch{return e}}log(e,t,r,s,n){if(e<this.level)return;let o=new Date().toISOString().replace("T"," ").substring(0,23),a=Y[e].padEnd(5),d=t.padEnd(6),l="";s?.correlationId?l=`[${s.correlationId}] `:s?.sessionId&&(l=`[session-${s.sessionId}] `);let h="";n!=null&&(this.level===0&&typeof n=="object"?h=`
`+JSON.stringify(n,null,2):h=" "+this.formatData(n));let u="";if(s){let{sessionId:f,sdkSessionId:m,correlationId:b,..._}=s;Object.keys(_).length>0&&(u=` {${Object.entries(_).map(([N,T])=>`${N}=${this.formatData(T)}`).join(", ")}}`)}let p=`[${o}] [${a}] [${d}] ${l}${r}${u}${h}`;e===3?console.error(p):console.log(p)}debug(e,t,r,s){this.log(0,e,t,r,s)}info(e,t,r,s){this.log(1,e,t,r,s)}warn(e,t,r,s){this.log(2,e,t,r,s)}error(e,t,r,s){this.log(3,e,t,r,s)}dataIn(e,t,r,s){this.info(e,`\u2192 ${t}`,r,s)}dataOut(e,t,r,s){this.info(e,`\u2190 ${t}`,r,s)}success(e,t,r,s){this.info(e,`\u2713 ${t}`,r,s)}failure(e,t,r,s){this.error(e,`\u2717 ${t}`,r,s)}timing(e,t,r,s){this.info(e,`\u23F1 ${t}`,s,{duration:`${r}ms`})}},ee=new V;var q=class{db;constructor(){X($),this.db=new me(B),this.db.pragma("journal_mode = WAL"),this.db.pragma("synchronous = NORMAL"),this.db.pragma("foreign_keys = ON"),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable()}initializeSchema(){try{this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_versions (
          id INTEGER PRIMARY KEY,
          version INTEGER UNIQUE NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);let e=this.db.prepare("SELECT version FROM schema_versions ORDER BY version").all();(e.length>0?Math.max(...e.map(r=>r.version)):0)===0&&(console.error("[SessionStore] Initializing fresh database with migration004..."),this.db.exec(`
          CREATE TABLE IF NOT EXISTS sdk_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claude_session_id TEXT UNIQUE NOT NULL,
            sdk_session_id TEXT UNIQUE,
            project TEXT NOT NULL,
            user_prompt TEXT,
            started_at TEXT NOT NULL,
            started_at_epoch INTEGER NOT NULL,
            completed_at TEXT,
            completed_at_epoch INTEGER,
            status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
          );

          CREATE INDEX IF NOT EXISTS idx_sdk_sessions_claude_id ON sdk_sessions(claude_session_id);
          CREATE INDEX IF NOT EXISTS idx_sdk_sessions_sdk_id ON sdk_sessions(sdk_session_id);
          CREATE INDEX IF NOT EXISTS idx_sdk_sessions_project ON sdk_sessions(project);
          CREATE INDEX IF NOT EXISTS idx_sdk_sessions_status ON sdk_sessions(status);
          CREATE INDEX IF NOT EXISTS idx_sdk_sessions_started ON sdk_sessions(started_at_epoch DESC);

          CREATE TABLE IF NOT EXISTS observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sdk_session_id TEXT NOT NULL,
            project TEXT NOT NULL,
            text TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('decision', 'bugfix', 'feature', 'refactor', 'discovery')),
            created_at TEXT NOT NULL,
            created_at_epoch INTEGER NOT NULL,
            FOREIGN KEY(sdk_session_id) REFERENCES sdk_sessions(sdk_session_id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_observations_sdk_session ON observations(sdk_session_id);
          CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
          CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
          CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);

          CREATE TABLE IF NOT EXISTS session_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sdk_session_id TEXT UNIQUE NOT NULL,
            project TEXT NOT NULL,
            request TEXT,
            investigated TEXT,
            learned TEXT,
            completed TEXT,
            next_steps TEXT,
            files_read TEXT,
            files_edited TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            created_at_epoch INTEGER NOT NULL,
            FOREIGN KEY(sdk_session_id) REFERENCES sdk_sessions(sdk_session_id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_session_summaries_sdk_session ON session_summaries(sdk_session_id);
          CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
          CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
        `),this.db.prepare("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString()),console.error("[SessionStore] Migration004 applied successfully"))}catch(e){throw console.error("[SessionStore] Schema initialization error:",e.message),e}}ensureWorkerPortColumn(){try{if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(5))return;this.db.pragma("table_info(sdk_sessions)").some(s=>s.name==="worker_port")||(this.db.exec("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),console.error("[SessionStore] Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}catch(e){console.error("[SessionStore] Migration error:",e.message)}}ensurePromptTrackingColumns(){try{if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(6))return;this.db.pragma("table_info(sdk_sessions)").some(d=>d.name==="prompt_counter")||(this.db.exec("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),console.error("[SessionStore] Added prompt_counter column to sdk_sessions table")),this.db.pragma("table_info(observations)").some(d=>d.name==="prompt_number")||(this.db.exec("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),console.error("[SessionStore] Added prompt_number column to observations table")),this.db.pragma("table_info(session_summaries)").some(d=>d.name==="prompt_number")||(this.db.exec("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),console.error("[SessionStore] Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}catch(e){console.error("[SessionStore] Prompt tracking migration error:",e.message)}}removeSessionSummariesUniqueConstraint(){try{if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(7))return;if(!this.db.pragma("index_list(session_summaries)").some(s=>s.unique===1)){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}console.error("[SessionStore] Removing UNIQUE constraint from session_summaries.sdk_session_id..."),this.db.exec("BEGIN TRANSACTION");try{this.db.exec(`
          CREATE TABLE session_summaries_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sdk_session_id TEXT NOT NULL,
            project TEXT NOT NULL,
            request TEXT,
            investigated TEXT,
            learned TEXT,
            completed TEXT,
            next_steps TEXT,
            files_read TEXT,
            files_edited TEXT,
            notes TEXT,
            prompt_number INTEGER,
            created_at TEXT NOT NULL,
            created_at_epoch INTEGER NOT NULL,
            FOREIGN KEY(sdk_session_id) REFERENCES sdk_sessions(sdk_session_id) ON DELETE CASCADE
          )
        `),this.db.exec(`
          INSERT INTO session_summaries_new
          SELECT id, sdk_session_id, project, request, investigated, learned,
                 completed, next_steps, files_read, files_edited, notes,
                 prompt_number, created_at, created_at_epoch
          FROM session_summaries
        `),this.db.exec("DROP TABLE session_summaries"),this.db.exec("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.exec(`
          CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(sdk_session_id);
          CREATE INDEX idx_session_summaries_project ON session_summaries(project);
          CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
        `),this.db.exec("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),console.error("[SessionStore] Successfully removed UNIQUE constraint from session_summaries.sdk_session_id")}catch(s){throw this.db.exec("ROLLBACK"),s}}catch(e){console.error("[SessionStore] Migration error (remove UNIQUE constraint):",e.message)}}addObservationHierarchicalFields(){try{if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.pragma("table_info(observations)").some(s=>s.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}console.error("[SessionStore] Adding hierarchical fields to observations table..."),this.db.exec(`
        ALTER TABLE observations ADD COLUMN title TEXT;
        ALTER TABLE observations ADD COLUMN subtitle TEXT;
        ALTER TABLE observations ADD COLUMN facts TEXT;
        ALTER TABLE observations ADD COLUMN narrative TEXT;
        ALTER TABLE observations ADD COLUMN concepts TEXT;
        ALTER TABLE observations ADD COLUMN files_read TEXT;
        ALTER TABLE observations ADD COLUMN files_modified TEXT;
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),console.error("[SessionStore] Successfully added hierarchical fields to observations table")}catch(e){console.error("[SessionStore] Migration error (add hierarchical fields):",e.message)}}makeObservationsTextNullable(){try{if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let r=this.db.pragma("table_info(observations)").find(s=>s.name==="text");if(!r||r.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}console.error("[SessionStore] Making observations.text nullable..."),this.db.exec("BEGIN TRANSACTION");try{this.db.exec(`
          CREATE TABLE observations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sdk_session_id TEXT NOT NULL,
            project TEXT NOT NULL,
            text TEXT,
            type TEXT NOT NULL CHECK(type IN ('decision', 'bugfix', 'feature', 'refactor', 'discovery', 'change')),
            title TEXT,
            subtitle TEXT,
            facts TEXT,
            narrative TEXT,
            concepts TEXT,
            files_read TEXT,
            files_modified TEXT,
            prompt_number INTEGER,
            created_at TEXT NOT NULL,
            created_at_epoch INTEGER NOT NULL,
            FOREIGN KEY(sdk_session_id) REFERENCES sdk_sessions(sdk_session_id) ON DELETE CASCADE
          )
        `),this.db.exec(`
          INSERT INTO observations_new
          SELECT id, sdk_session_id, project, text, type, title, subtitle, facts,
                 narrative, concepts, files_read, files_modified, prompt_number,
                 created_at, created_at_epoch
          FROM observations
        `),this.db.exec("DROP TABLE observations"),this.db.exec("ALTER TABLE observations_new RENAME TO observations"),this.db.exec(`
          CREATE INDEX idx_observations_sdk_session ON observations(sdk_session_id);
          CREATE INDEX idx_observations_project ON observations(project);
          CREATE INDEX idx_observations_type ON observations(type);
          CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
        `),this.db.exec("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),console.error("[SessionStore] Successfully made observations.text nullable")}catch(s){throw this.db.exec("ROLLBACK"),s}}catch(e){console.error("[SessionStore] Migration error (make text nullable):",e.message)}}createUserPromptsTable(){try{if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.pragma("table_info(user_prompts)").length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}console.error("[SessionStore] Creating user_prompts table with FTS5 support..."),this.db.exec("BEGIN TRANSACTION");try{this.db.exec(`
          CREATE TABLE user_prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claude_session_id TEXT NOT NULL,
            prompt_number INTEGER NOT NULL,
            prompt_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_at_epoch INTEGER NOT NULL,
            FOREIGN KEY(claude_session_id) REFERENCES sdk_sessions(claude_session_id) ON DELETE CASCADE
          );

          CREATE INDEX idx_user_prompts_claude_session ON user_prompts(claude_session_id);
          CREATE INDEX idx_user_prompts_created ON user_prompts(created_at_epoch DESC);
          CREATE INDEX idx_user_prompts_prompt_number ON user_prompts(prompt_number);
        `),this.db.exec(`
          CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
            prompt_text,
            content='user_prompts',
            content_rowid='id'
          );
        `),this.db.exec(`
          CREATE TRIGGER user_prompts_ai AFTER INSERT ON user_prompts BEGIN
            INSERT INTO user_prompts_fts(rowid, prompt_text)
            VALUES (new.id, new.prompt_text);
          END;

          CREATE TRIGGER user_prompts_ad AFTER DELETE ON user_prompts BEGIN
            INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
            VALUES('delete', old.id, old.prompt_text);
          END;

          CREATE TRIGGER user_prompts_au AFTER UPDATE ON user_prompts BEGIN
            INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
            VALUES('delete', old.id, old.prompt_text);
            INSERT INTO user_prompts_fts(rowid, prompt_text)
            VALUES (new.id, new.prompt_text);
          END;
        `),this.db.exec("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),console.error("[SessionStore] Successfully created user_prompts table with FTS5 support")}catch(r){throw this.db.exec("ROLLBACK"),r}}catch(e){console.error("[SessionStore] Migration error (create user_prompts table):",e.message)}}getRecentSummaries(e,t=10){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentSummariesWithSessionInfo(e,t=3){return this.db.prepare(`
      SELECT
        sdk_session_id, request, learned, completed, next_steps,
        prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentObservations(e,t=20){return this.db.prepare(`
      SELECT type, text, prompt_number, created_at
      FROM observations
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getAllRecentObservations(e=100){return this.db.prepare(`
      SELECT id, type, title, subtitle, text, project, prompt_number, created_at, created_at_epoch
      FROM observations
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentSummaries(e=50){return this.db.prepare(`
      SELECT id, request, investigated, learned, completed, next_steps,
             files_read, files_edited, notes, project, prompt_number,
             created_at, created_at_epoch
      FROM session_summaries
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentUserPrompts(e=100){return this.db.prepare(`
      SELECT
        up.id,
        up.claude_session_id,
        s.project,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.claude_session_id = s.claude_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(){return this.db.prepare(`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
      ORDER BY project ASC
    `).all().map(r=>r.project)}getRecentSessionsWithStatus(e,t=3){return this.db.prepare(`
      SELECT * FROM (
        SELECT
          s.sdk_session_id,
          s.status,
          s.started_at,
          s.started_at_epoch,
          s.user_prompt,
          CASE WHEN sum.sdk_session_id IS NOT NULL THEN 1 ELSE 0 END as has_summary
        FROM sdk_sessions s
        LEFT JOIN session_summaries sum ON s.sdk_session_id = sum.sdk_session_id
        WHERE s.project = ? AND s.sdk_session_id IS NOT NULL
        GROUP BY s.sdk_session_id
        ORDER BY s.started_at_epoch DESC
        LIMIT ?
      )
      ORDER BY started_at_epoch ASC
    `).all(e,t)}getObservationsForSession(e){return this.db.prepare(`
      SELECT title, subtitle, type, prompt_number
      FROM observations
      WHERE sdk_session_id = ?
      ORDER BY created_at_epoch ASC
    `).all(e)}getObservationById(e){return this.db.prepare(`
      SELECT *
      FROM observations
      WHERE id = ?
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:r="date_desc",limit:s}=t,n=r==="date_asc"?"ASC":"DESC",o=s?`LIMIT ${s}`:"",a=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT *
      FROM observations
      WHERE id IN (${a})
      ORDER BY created_at_epoch ${n}
      ${o}
    `).all(...e)}getSummaryForSession(e){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at
      FROM session_summaries
      WHERE sdk_session_id = ?
      ORDER BY created_at_epoch DESC
      LIMIT 1
    `).get(e)||null}getFilesForSession(e){let r=this.db.prepare(`
      SELECT files_read, files_modified
      FROM observations
      WHERE sdk_session_id = ?
    `).all(e),s=new Set,n=new Set;for(let o of r){if(o.files_read)try{let a=JSON.parse(o.files_read);Array.isArray(a)&&a.forEach(d=>s.add(d))}catch{}if(o.files_modified)try{let a=JSON.parse(o.files_modified);Array.isArray(a)&&a.forEach(d=>n.add(d))}catch{}}return{filesRead:Array.from(s),filesModified:Array.from(n)}}getSessionById(e){return this.db.prepare(`
      SELECT id, claude_session_id, sdk_session_id, project, user_prompt
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}findActiveSDKSession(e){return this.db.prepare(`
      SELECT id, sdk_session_id, project, worker_port
      FROM sdk_sessions
      WHERE claude_session_id = ? AND status = 'active'
      LIMIT 1
    `).get(e)||null}findAnySDKSession(e){return this.db.prepare(`
      SELECT id
      FROM sdk_sessions
      WHERE claude_session_id = ?
      LIMIT 1
    `).get(e)||null}reactivateSession(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET status = 'active', user_prompt = ?, worker_port = NULL
      WHERE id = ?
    `).run(t,e)}incrementPromptCounter(e){return this.db.prepare(`
      UPDATE sdk_sessions
      SET prompt_counter = COALESCE(prompt_counter, 0) + 1
      WHERE id = ?
    `).run(e),this.db.prepare(`
      SELECT prompt_counter FROM sdk_sessions WHERE id = ?
    `).get(e)?.prompt_counter||1}getPromptCounter(e){return this.db.prepare(`
      SELECT prompt_counter FROM sdk_sessions WHERE id = ?
    `).get(e)?.prompt_counter||0}createSDKSession(e,t,r){let s=new Date,n=s.getTime(),a=this.db.prepare(`
      INSERT OR IGNORE INTO sdk_sessions
      (claude_session_id, sdk_session_id, project, user_prompt, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(e,e,t,r,s.toISOString(),n);return a.lastInsertRowid===0||a.changes===0?this.db.prepare(`
        SELECT id FROM sdk_sessions WHERE claude_session_id = ? LIMIT 1
      `).get(e).id:a.lastInsertRowid}updateSDKSessionId(e,t){return this.db.prepare(`
      UPDATE sdk_sessions
      SET sdk_session_id = ?
      WHERE id = ? AND sdk_session_id IS NULL
    `).run(t,e).changes===0?(ee.debug("DB","sdk_session_id already set, skipping update",{sessionId:e,sdkSessionId:t}),!1):!0}setWorkerPort(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET worker_port = ?
      WHERE id = ?
    `).run(t,e)}getWorkerPort(e){return this.db.prepare(`
      SELECT worker_port
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)?.worker_port||null}saveUserPrompt(e,t,r){let s=new Date,n=s.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (claude_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,r,s.toISOString(),n).lastInsertRowid}storeObservation(e,t,r,s){let n=new Date,o=n.getTime();this.db.prepare(`
      SELECT id FROM sdk_sessions WHERE sdk_session_id = ?
    `).get(e)||(this.db.prepare(`
        INSERT INTO sdk_sessions
        (claude_session_id, sdk_session_id, project, started_at, started_at_epoch, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(e,e,t,n.toISOString(),o),console.error(`[SessionStore] Auto-created session record for session_id: ${e}`));let h=this.db.prepare(`
      INSERT INTO observations
      (sdk_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,r.type,r.title,r.subtitle,JSON.stringify(r.facts),r.narrative,JSON.stringify(r.concepts),JSON.stringify(r.files_read),JSON.stringify(r.files_modified),s||null,n.toISOString(),o);return{id:Number(h.lastInsertRowid),createdAtEpoch:o}}storeSummary(e,t,r,s){let n=new Date,o=n.getTime();this.db.prepare(`
      SELECT id FROM sdk_sessions WHERE sdk_session_id = ?
    `).get(e)||(this.db.prepare(`
        INSERT INTO sdk_sessions
        (claude_session_id, sdk_session_id, project, started_at, started_at_epoch, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(e,e,t,n.toISOString(),o),console.error(`[SessionStore] Auto-created session record for session_id: ${e}`));let h=this.db.prepare(`
      INSERT INTO session_summaries
      (sdk_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,s||null,n.toISOString(),o);return{id:Number(h.lastInsertRowid),createdAtEpoch:o}}markSessionCompleted(e){let t=new Date,r=t.getTime();this.db.prepare(`
      UPDATE sdk_sessions
      SET status = 'completed', completed_at = ?, completed_at_epoch = ?
      WHERE id = ?
    `).run(t.toISOString(),r,e)}markSessionFailed(e){let t=new Date,r=t.getTime();this.db.prepare(`
      UPDATE sdk_sessions
      SET status = 'failed', completed_at = ?, completed_at_epoch = ?
      WHERE id = ?
    `).run(t.toISOString(),r,e)}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:r="date_desc",limit:s}=t,n=r==="date_asc"?"ASC":"DESC",o=s?`LIMIT ${s}`:"",a=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT * FROM session_summaries
      WHERE id IN (${a})
      ORDER BY created_at_epoch ${n}
      ${o}
    `).all(...e)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:r="date_desc",limit:s}=t,n=r==="date_asc"?"ASC":"DESC",o=s?`LIMIT ${s}`:"",a=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.sdk_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.claude_session_id = s.claude_session_id
      WHERE up.id IN (${a})
      ORDER BY up.created_at_epoch ${n}
      ${o}
    `).all(...e)}getTimelineAroundTimestamp(e,t=10,r=10,s){return this.getTimelineAroundObservation(null,e,t,r,s)}getTimelineAroundObservation(e,t,r=10,s=10,n){let o=n?"AND project = ?":"",a=n?[n]:[],d,l;if(e!==null){let f=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${o}
        ORDER BY id DESC
        LIMIT ?
      `,m=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${o}
        ORDER BY id ASC
        LIMIT ?
      `;try{let b=this.db.prepare(f).all(e,...a,r+1),_=this.db.prepare(m).all(e,...a,s+1);if(b.length===0&&_.length===0)return{observations:[],sessions:[],prompts:[]};d=b.length>0?b[b.length-1].created_at_epoch:t,l=_.length>0?_[_.length-1].created_at_epoch:t}catch(b){return console.error("[SessionStore] Error getting boundary observations:",b.message),{observations:[],sessions:[],prompts:[]}}}else{let f=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${o}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,m=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${o}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let b=this.db.prepare(f).all(t,...a,r),_=this.db.prepare(m).all(t,...a,s+1);if(b.length===0&&_.length===0)return{observations:[],sessions:[],prompts:[]};d=b.length>0?b[b.length-1].created_at_epoch:t,l=_.length>0?_[_.length-1].created_at_epoch:t}catch(b){return console.error("[SessionStore] Error getting boundary timestamps:",b.message),{observations:[],sessions:[],prompts:[]}}}let h=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${o}
      ORDER BY created_at_epoch ASC
    `,u=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${o}
      ORDER BY created_at_epoch ASC
    `,p=`
      SELECT up.*, s.project, s.sdk_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.claude_session_id = s.claude_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${o.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `;try{let f=this.db.prepare(h).all(d,l,...a),m=this.db.prepare(u).all(d,l,...a),b=this.db.prepare(p).all(d,l,...a);return{observations:f,sessions:m.map(_=>({id:_.id,sdk_session_id:_.sdk_session_id,project:_.project,request:_.request,completed:_.completed,next_steps:_.next_steps,created_at:_.created_at,created_at_epoch:_.created_at_epoch})),prompts:b.map(_=>({id:_.id,claude_session_id:_.claude_session_id,project:_.project,prompt:_.prompt_text,created_at:_.created_at,created_at_epoch:_.created_at_epoch}))}}catch(f){return console.error("[SessionStore] Error querying timeline records:",f.message),{observations:[],sessions:[],prompts:[]}}}close(){this.db.close()}};var k,x,U=null,Re="cm__claude-mem";try{k=new P,x=new q}catch(i){console.error("[search-server] Failed to initialize search:",i.message),process.exit(1)}async function j(i,e,t){if(!U)throw new Error("Chroma client not initialized");let s=(await U.callTool({name:"chroma_query_documents",arguments:{collection_name:Re,query_texts:[i],n_results:e,include:["documents","metadatas","distances"],where:t}})).content[0]?.text||"",n;try{n=JSON.parse(s)}catch(h){return console.error("[search-server] Failed to parse Chroma response as JSON:",h),{ids:[],distances:[],metadatas:[]}}let o=[],a=n.ids?.[0]||[];for(let h of a){let u=h.match(/obs_(\d+)_/),p=h.match(/summary_(\d+)_/),f=h.match(/prompt_(\d+)/),m=null;u?m=parseInt(u[1],10):p?m=parseInt(p[1],10):f&&(m=parseInt(f[1],10)),m!==null&&!o.includes(m)&&o.push(m)}let d=n.distances?.[0]||[],l=n.metadatas?.[0]||[];return{ids:o,distances:d,metadatas:l}}function G(){return`
---
\u{1F4A1} Search Strategy:
ALWAYS search with index format FIRST to get an overview and identify relevant results.
This is critical for token efficiency - index format uses ~10x fewer tokens than full format.

Search workflow:
1. Initial search: Use default (index) format to see titles, dates, and sources
2. Review results: Identify which items are most relevant to your needs
3. Deep dive: Only then use format: "full" on specific items of interest
4. Narrow down: Use filters (type, dateRange, concepts, files) to refine results

Other tips:
\u2022 To browse by metadata: Omit query parameter and use type/concepts/files filters
\u2022 To search files: Use find_by_file tool (returns observations + sessions)
\u2022 To sort by date: Use orderBy: "date_desc" or "date_asc"`}function te(i,e){let t=i.title||`Observation #${i.id}`,r=new Date(i.created_at_epoch).toLocaleString(),s=i.type?`[${i.type}]`:"";return`${e+1}. ${s} ${t}
   Date: ${r}
   Source: claude-mem://observation/${i.id}`}function se(i,e){let t=i.request||`Session ${i.sdk_session_id.substring(0,8)}`,r=new Date(i.created_at_epoch).toLocaleString();return`${e+1}. ${t}
   Date: ${r}
   Source: claude-mem://session/${i.sdk_session_id}`}function re(i){let e=i.title||`Observation #${i.id}`,t=[];t.push(`## ${e}`),t.push(`*Source: claude-mem://observation/${i.id}*`),t.push(""),i.subtitle&&(t.push(`**${i.subtitle}**`),t.push("")),i.narrative&&(t.push(i.narrative),t.push("")),i.text&&(t.push(i.text),t.push(""));let r=[];if(r.push(`Type: ${i.type}`),i.facts)try{let n=JSON.parse(i.facts);n.length>0&&r.push(`Facts: ${n.join("; ")}`)}catch{}if(i.concepts)try{let n=JSON.parse(i.concepts);n.length>0&&r.push(`Concepts: ${n.join(", ")}`)}catch{}if(i.files_read||i.files_modified){let n=[];if(i.files_read)try{n.push(...JSON.parse(i.files_read))}catch{}if(i.files_modified)try{n.push(...JSON.parse(i.files_modified))}catch{}n.length>0&&r.push(`Files: ${[...new Set(n)].join(", ")}`)}r.length>0&&(t.push("---"),t.push(r.join(" | ")));let s=new Date(i.created_at_epoch).toLocaleString();return t.push(""),t.push("---"),t.push(`Date: ${s}`),t.join(`
`)}function ne(i){let e=i.request||`Session ${i.sdk_session_id.substring(0,8)}`,t=[];t.push(`## ${e}`),t.push(`*Source: claude-mem://session/${i.sdk_session_id}*`),t.push(""),i.completed&&(t.push(`**Completed:** ${i.completed}`),t.push("")),i.learned&&(t.push(`**Learned:** ${i.learned}`),t.push("")),i.investigated&&(t.push(`**Investigated:** ${i.investigated}`),t.push("")),i.next_steps&&(t.push(`**Next Steps:** ${i.next_steps}`),t.push("")),i.notes&&(t.push(`**Notes:** ${i.notes}`),t.push(""));let r=[];if(i.files_read||i.files_edited){let n=[];if(i.files_read)try{n.push(...JSON.parse(i.files_read))}catch{}if(i.files_edited)try{n.push(...JSON.parse(i.files_edited))}catch{}n.length>0&&r.push(`Files: ${[...new Set(n)].join(", ")}`)}let s=new Date(i.created_at_epoch).toLocaleDateString();return r.push(`Date: ${s}`),r.length>0&&(t.push("---"),t.push(r.join(" | "))),t.join(`
`)}function ye(i,e){let t=new Date(i.created_at_epoch).toLocaleString();return`${e+1}. "${i.prompt_text}"
   Date: ${t} | Prompt #${i.prompt_number}
   Source: claude-mem://user-prompt/${i.id}`}function ve(i){let e=[];e.push(`## User Prompt #${i.prompt_number}`),e.push(`*Source: claude-mem://user-prompt/${i.id}*`),e.push(""),e.push(i.prompt_text),e.push(""),e.push("---");let t=new Date(i.created_at_epoch).toLocaleString();return e.push(`Date: ${t}`),e.join(`
`)}var Oe=c.object({project:c.string().optional().describe("Filter by project name"),type:c.union([c.enum(["decision","bugfix","feature","refactor","discovery","change"]),c.array(c.enum(["decision","bugfix","feature","refactor","discovery","change"]))]).optional().describe("Filter by observation type"),concepts:c.union([c.string(),c.array(c.string())]).optional().describe("Filter by concept tags"),files:c.union([c.string(),c.array(c.string())]).optional().describe("Filter by file paths (partial match)"),dateRange:c.object({start:c.union([c.string(),c.number()]).optional().describe("Start date (ISO string or epoch)"),end:c.union([c.string(),c.number()]).optional().describe("End date (ISO string or epoch)")}).optional().describe("Filter by date range"),limit:c.number().min(1).max(100).default(20).describe("Maximum number of results"),offset:c.number().min(0).default(0).describe("Number of results to skip"),orderBy:c.enum(["relevance","date_desc","date_asc"]).default("date_desc").describe("Sort order")}),oe=[{name:"search_observations",description:'Search observations using full-text search across titles, narratives, facts, and concepts. If query is omitted, returns all observations matching the provided filters (type, concepts, files, dateRange). IMPORTANT: Always use index format first (default) to get an overview with minimal token usage, then use format: "full" only for specific items of interest.',inputSchema:c.object({query:c.string().optional().describe("Search query for FTS5 full-text search. If omitted, returns all observations matching filters (useful for browsing by type, concept, etc.)"),format:c.enum(["index","full"]).default("index").describe('Output format: "index" for titles/dates only (default, RECOMMENDED for initial search), "full" for complete details (use only after reviewing index results)'),...Oe.shape}),handler:async i=>{try{let{query:e,format:t="index",...r}=i,s=[];if(e){if(U)try{console.error("[search-server] Using hybrid semantic search (Chroma + SQLite)");let o=await j(e,100);if(console.error(`[search-server] Chroma returned ${o.ids.length} semantic matches`),o.ids.length>0){let a=Date.now()-7776e6,d=o.ids.filter((l,h)=>{let u=o.metadatas[h];return u&&u.created_at_epoch>a});if(console.error(`[search-server] ${d.length} results within 90-day window`),d.length>0){let l=r.limit||20;s=x.getObservationsByIds(d,{orderBy:"date_desc",limit:l}),console.error(`[search-server] Hydrated ${s.length} observations from SQLite`)}}}catch(o){console.error("[search-server] Chroma query failed, falling back to FTS5:",o.message)}s.length===0&&(console.error("[search-server] Using FTS5 keyword search"),s=k.searchObservations(e,r))}else if(console.error("[search-server] Query-less search: using metadata filters only"),r.concepts){let o=Array.isArray(r.concepts)?r.concepts[0]:r.concepts;s=k.findByConcept(o,r)}else r.type?s=k.findByType(r.type,r):s=k.searchObservations("",{...r,orderBy:"date_desc"});if(s.length===0)return{content:[{type:"text",text:`No observations found ${e?`matching "${e}"`:"matching filters"}`}]};let n;if(t==="index"){let o=e?`matching "${e}"`:"matching filters",a=`Found ${s.length} observation(s) ${o}:

`,d=s.map((l,h)=>te(l,h));n=a+d.join(`

`)+G()}else n=s.map(a=>re(a)).join(`

---

`);return{content:[{type:"text",text:n}]}}catch(e){return{content:[{type:"text",text:`Search failed: ${e.message}`}],isError:!0}}}},{name:"search_sessions",description:'Search session summaries using full-text search across requests, completions, learnings, and notes. IMPORTANT: Always use index format first (default) to get an overview with minimal token usage, then use format: "full" only for specific items of interest.',inputSchema:c.object({query:c.string().describe("Search query for FTS5 full-text search"),format:c.enum(["index","full"]).default("index").describe('Output format: "index" for titles/dates only (default, RECOMMENDED for initial search), "full" for complete details (use only after reviewing index results)'),project:c.string().optional().describe("Filter by project name"),dateRange:c.object({start:c.union([c.string(),c.number()]).optional(),end:c.union([c.string(),c.number()]).optional()}).optional().describe("Filter by date range"),limit:c.number().min(1).max(100).default(20).describe("Maximum number of results"),offset:c.number().min(0).default(0).describe("Number of results to skip"),orderBy:c.enum(["relevance","date_desc","date_asc"]).default("date_desc").describe("Sort order")}),handler:async i=>{try{let{query:e,format:t="index",...r}=i,s=[];if(U)try{console.error("[search-server] Using hybrid semantic search for sessions");let o=await j(e,100,{doc_type:"session_summary"});if(console.error(`[search-server] Chroma returned ${o.ids.length} semantic matches`),o.ids.length>0){let a=Date.now()-7776e6,d=o.ids.filter((l,h)=>{let u=o.metadatas[h];return u&&u.created_at_epoch>a});if(console.error(`[search-server] ${d.length} results within 90-day window`),d.length>0){let l=r.limit||20;s=x.getSessionSummariesByIds(d,{orderBy:"date_desc",limit:l}),console.error(`[search-server] Hydrated ${s.length} sessions from SQLite`)}}}catch(o){console.error("[search-server] Chroma query failed, falling back to FTS5:",o.message)}if(s.length===0&&(console.error("[search-server] Using FTS5 keyword search"),s=k.searchSessions(e,r)),s.length===0)return{content:[{type:"text",text:`No sessions found matching "${e}"`}]};let n;if(t==="index"){let o=`Found ${s.length} session(s) matching "${e}":

`,a=s.map((d,l)=>se(d,l));n=o+a.join(`

`)+G()}else n=s.map(a=>ne(a)).join(`

---

`);return{content:[{type:"text",text:n}]}}catch(e){return{content:[{type:"text",text:`Search failed: ${e.message}`}],isError:!0}}}},{name:"find_by_file",description:'Find observations and sessions that reference a specific file path. IMPORTANT: Always use index format first (default) to get an overview with minimal token usage, then use format: "full" only for specific items of interest.',inputSchema:c.object({filePath:c.string().describe("File path to search for (supports partial matching)"),format:c.enum(["index","full"]).default("index").describe('Output format: "index" for titles/dates only (default, RECOMMENDED for initial search), "full" for complete details (use only after reviewing index results)'),project:c.string().optional().describe("Filter by project name"),dateRange:c.object({start:c.union([c.string(),c.number()]).optional(),end:c.union([c.string(),c.number()]).optional()}).optional().describe("Filter by date range"),limit:c.number().min(1).max(100).default(20).describe("Maximum results. IMPORTANT: Start with 3-5 to avoid exceeding MCP token limits, even in index mode."),offset:c.number().min(0).default(0).describe("Number of results to skip"),orderBy:c.enum(["relevance","date_desc","date_asc"]).default("date_desc").describe("Sort order")}),handler:async i=>{try{let{filePath:e,format:t="index",...r}=i,s=[],n=[];if(U)try{console.error("[search-server] Using metadata-first + semantic ranking for file search");let d=k.findByFile(e,r);if(console.error(`[search-server] Found ${d.observations.length} observations, ${d.sessions.length} sessions for file "${e}"`),n=d.sessions,d.observations.length>0){let l=d.observations.map(p=>p.id),h=await j(e,Math.min(l.length,100)),u=[];for(let p of h.ids)l.includes(p)&&!u.includes(p)&&u.push(p);console.error(`[search-server] Chroma ranked ${u.length} observations by semantic relevance`),u.length>0&&(s=x.getObservationsByIds(u,{limit:r.limit||20}),s.sort((p,f)=>u.indexOf(p.id)-u.indexOf(f.id)))}}catch(d){console.error("[search-server] Chroma ranking failed, using SQLite order:",d.message)}if(s.length===0&&n.length===0){console.error("[search-server] Using SQLite-only file search");let d=k.findByFile(e,r);s=d.observations,n=d.sessions}let o=s.length+n.length;if(o===0)return{content:[{type:"text",text:`No results found for file "${e}"`}]};let a;if(t==="index"){let d=`Found ${o} result(s) for file "${e}":

`,l=[];s.forEach((h,u)=>{l.push(te(h,u))}),n.forEach((h,u)=>{l.push(se(h,u+s.length))}),a=d+l.join(`

`)+G()}else{let d=[];s.forEach(l=>{d.push(re(l))}),n.forEach(l=>{d.push(ne(l))}),a=d.join(`

---

`)}return{content:[{type:"text",text:a}]}}catch(e){return{content:[{type:"text",text:`Search failed: ${e.message}`}],isError:!0}}}},{name:"get_recent_context",description:"Get recent session context including summaries and observations for a project",inputSchema:c.object({project:c.string().optional().describe("Project name (defaults to current working directory basename)"),limit:c.number().min(1).max(10).default(3).describe("Number of recent sessions to retrieve")}),handler:async i=>{try{let e=i.project||Se(process.cwd()),t=i.limit||3,r=x.getRecentSessionsWithStatus(e,t);if(r.length===0)return{content:[{type:"text",text:`# Recent Session Context

No previous sessions found for project "${e}".`}]};let s=[];s.push("# Recent Session Context"),s.push(""),s.push(`Showing last ${r.length} session(s) for **${e}**:`),s.push("");for(let n of r)if(n.sdk_session_id){if(s.push("---"),s.push(""),n.has_summary){let o=x.getSummaryForSession(n.sdk_session_id);if(o){let a=o.prompt_number?` (Prompt #${o.prompt_number})`:"";if(s.push(`**Summary${a}**`),s.push(""),o.request&&s.push(`**Request:** ${o.request}`),o.completed&&s.push(`**Completed:** ${o.completed}`),o.learned&&s.push(`**Learned:** ${o.learned}`),o.next_steps&&s.push(`**Next Steps:** ${o.next_steps}`),o.files_read)try{let l=JSON.parse(o.files_read);Array.isArray(l)&&l.length>0&&s.push(`**Files Read:** ${l.join(", ")}`)}catch{o.files_read.trim()&&s.push(`**Files Read:** ${o.files_read}`)}if(o.files_edited)try{let l=JSON.parse(o.files_edited);Array.isArray(l)&&l.length>0&&s.push(`**Files Edited:** ${l.join(", ")}`)}catch{o.files_edited.trim()&&s.push(`**Files Edited:** ${o.files_edited}`)}let d=new Date(o.created_at).toLocaleString();s.push(`**Date:** ${d}`)}}else if(n.status==="active"){s.push("**In Progress**"),s.push(""),n.user_prompt&&s.push(`**Request:** ${n.user_prompt}`);let o=x.getObservationsForSession(n.sdk_session_id);if(o.length>0){s.push(""),s.push(`**Observations (${o.length}):**`);for(let d of o)s.push(`- ${d.title}`)}else s.push(""),s.push("*No observations yet*");s.push(""),s.push("**Status:** Active - summary pending");let a=new Date(n.started_at).toLocaleString();s.push(`**Date:** ${a}`)}else{s.push(`**${n.status.charAt(0).toUpperCase()+n.status.slice(1)}**`),s.push(""),n.user_prompt&&s.push(`**Request:** ${n.user_prompt}`),s.push(""),s.push(`**Status:** ${n.status} - no summary available`);let o=new Date(n.started_at).toLocaleString();s.push(`**Date:** ${o}`)}s.push("")}return{content:[{type:"text",text:s.join(`
`)}]}}catch(e){return{content:[{type:"text",text:`Failed to get recent context: ${e.message}`}],isError:!0}}}},{name:"search_user_prompts",description:'Search raw user prompts with full-text search. Use this to find what the user actually said/requested across all sessions. IMPORTANT: Always use index format first (default) to get an overview with minimal token usage, then use format: "full" only for specific items of interest.',inputSchema:c.object({query:c.string().describe("Search query for FTS5 full-text search"),format:c.enum(["index","full"]).default("index").describe('Output format: "index" for truncated prompts/dates (default, RECOMMENDED for initial search), "full" for complete prompt text (use only after reviewing index results)'),project:c.string().optional().describe("Filter by project name"),dateRange:c.object({start:c.union([c.string(),c.number()]).optional(),end:c.union([c.string(),c.number()]).optional()}).optional().describe("Filter by date range"),limit:c.number().min(1).max(100).default(20).describe("Maximum number of results"),offset:c.number().min(0).default(0).describe("Number of results to skip"),orderBy:c.enum(["relevance","date_desc","date_asc"]).default("date_desc").describe("Sort order")}),handler:async i=>{try{let{query:e,format:t="index",...r}=i,s=[];if(U)try{console.error("[search-server] Using hybrid semantic search for user prompts");let o=await j(e,100,{doc_type:"user_prompt"});if(console.error(`[search-server] Chroma returned ${o.ids.length} semantic matches`),o.ids.length>0){let a=Date.now()-7776e6,d=o.ids.filter((l,h)=>{let u=o.metadatas[h];return u&&u.created_at_epoch>a});if(console.error(`[search-server] ${d.length} results within 90-day window`),d.length>0){let l=r.limit||20;s=x.getUserPromptsByIds(d,{orderBy:"date_desc",limit:l}),console.error(`[search-server] Hydrated ${s.length} user prompts from SQLite`)}}}catch(o){console.error("[search-server] Chroma query failed, falling back to FTS5:",o.message)}if(s.length===0&&(console.error("[search-server] Using FTS5 keyword search"),s=k.searchUserPrompts(e,r)),s.length===0)return{content:[{type:"text",text:`No user prompts found matching "${e}"`}]};let n;if(t==="index"){let o=`Found ${s.length} user prompt(s) matching "${e}":

`,a=s.map((d,l)=>ye(d,l));n=o+a.join(`

`)+G()}else n=s.map(a=>ve(a)).join(`

---

`);return{content:[{type:"text",text:n}]}}catch(e){return{content:[{type:"text",text:`Search failed: ${e.message}`}],isError:!0}}}},{name:"get_context_timeline",description:'Get a unified timeline of context (observations, sessions, and prompts) around a specific point in time. All record types are interleaved chronologically. Useful for understanding "what was happening when X occurred". Returns depth_before records before anchor + anchor + depth_after records after (total: depth_before + 1 + depth_after mixed records).',inputSchema:c.object({anchor:c.union([c.number().describe("Observation ID to center timeline around"),c.string().describe("Session ID (format: S123) or ISO timestamp to center timeline around")]).describe('Anchor point: observation ID, session ID (e.g., "S123"), or ISO timestamp'),depth_before:c.number().min(0).max(50).default(10).describe("Number of records to retrieve before anchor, not including anchor (default: 10)"),depth_after:c.number().min(0).max(50).default(10).describe("Number of records to retrieve after anchor, not including anchor (default: 10)"),project:c.string().optional().describe("Filter by project name")}),handler:async i=>{try{let f=function(g){return new Date(g).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})},m=function(g){return new Date(g).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})},b=function(g){return new Date(g).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})},_=function(g){return g?Math.ceil(g.length/4):0};var e=f,t=m,r=b,s=_;let{anchor:n,depth_before:o=10,depth_after:a=10,project:d}=i,l,h=n,u;if(typeof n=="number"){let g=x.getObservationById(n);if(!g)return{content:[{type:"text",text:`Observation #${n} not found`}],isError:!0};l=g.created_at_epoch,u=x.getTimelineAroundObservation(n,l,o,a,d)}else if(typeof n=="string")if(n.startsWith("S")||n.startsWith("#S")){let g=n.replace(/^#?S/,""),I=parseInt(g,10),S=x.getSessionSummariesByIds([I]);if(S.length===0)return{content:[{type:"text",text:`Session #${I} not found`}],isError:!0};l=S[0].created_at_epoch,h=`S${I}`,u=x.getTimelineAroundTimestamp(l,o,a,d)}else{let g=new Date(n);if(isNaN(g.getTime()))return{content:[{type:"text",text:`Invalid timestamp: ${n}`}],isError:!0};l=g.getTime(),u=x.getTimelineAroundTimestamp(l,o,a,d)}else return{content:[{type:"text",text:'Invalid anchor: must be observation ID (number), session ID (e.g., "S123"), or ISO timestamp'}],isError:!0};let p=[...u.observations.map(g=>({type:"observation",data:g,epoch:g.created_at_epoch})),...u.sessions.map(g=>({type:"session",data:g,epoch:g.created_at_epoch})),...u.prompts.map(g=>({type:"prompt",data:g,epoch:g.created_at_epoch}))];if(p.sort((g,I)=>g.epoch-I.epoch),p.length===0)return{content:[{type:"text",text:`No context found around ${new Date(l).toLocaleString()} (${o} records before, ${a} records after)`}]};let E=[];E.push(`# Timeline around anchor: ${h}`),E.push(`**Window:** ${o} records before \u2192 ${a} records after | **Items:** ${p.length} (${u.observations.length} obs, ${u.sessions.length} sessions, ${u.prompts.length} prompts)`),E.push(""),E.push("**Legend:** \u{1F3AF} session-request | \u{1F534} bugfix | \u{1F7E3} feature | \u{1F504} refactor | \u2705 change | \u{1F535} discovery | \u{1F9E0} decision"),E.push("");let N=new Map;for(let g of p){let I=f(g.epoch);N.has(I)||N.set(I,[]),N.get(I).push(g)}let T=Array.from(N.entries()).sort((g,I)=>{let S=new Date(g[0]).getTime(),O=new Date(I[0]).getTime();return S-O});for(let[g,I]of T){E.push(`### ${g}`),E.push("");let S=null,O="",C=!1;for(let v of I){let w=typeof h=="number"&&v.type==="observation"&&v.data.id===h||typeof h=="string"&&h.startsWith("S")&&v.type==="session"&&`S${v.data.id}`===h;if(v.type==="session"){C&&(E.push(""),C=!1,S=null,O="");let R=v.data,F=R.request||"Session summary",y=`claude-mem://session-summary/${R.id}`,A=w?" \u2190 **ANCHOR**":"";E.push(`**\u{1F3AF} #S${R.id}** ${F} (${b(v.epoch)}) [\u2192](${y})${A}`),E.push("")}else if(v.type==="prompt"){C&&(E.push(""),C=!1,S=null,O="");let R=v.data,F=R.prompt.length>100?R.prompt.substring(0,100)+"...":R.prompt;E.push(`**\u{1F4AC} User Prompt #${R.prompt_number}** (${b(v.epoch)})`),E.push(`> ${F}`),E.push("")}else if(v.type==="observation"){let R=v.data,F="General";F!==S&&(C&&E.push(""),E.push(`**${F}**`),E.push("| ID | Time | T | Title | Tokens |"),E.push("|----|------|---|-------|--------|"),S=F,C=!0,O="");let y="\u2022";switch(R.type){case"bugfix":y="\u{1F534}";break;case"feature":y="\u{1F7E3}";break;case"refactor":y="\u{1F504}";break;case"change":y="\u2705";break;case"discovery":y="\u{1F535}";break;case"decision":y="\u{1F9E0}";break}let A=m(v.epoch),D=R.title||"Untitled",M=_(R.narrative),H=A!==O?A:"\u2033";O=A;let Q=w?" \u2190 **ANCHOR**":"";E.push(`| #${R.id} | ${H} | ${y} | ${D}${Q} | ~${M} |`)}}C&&E.push("")}return{content:[{type:"text",text:E.join(`
`)}]}}catch(n){return{content:[{type:"text",text:`Timeline query failed: ${n.message}`}],isError:!0}}}},{name:"get_timeline_by_query",description:'Search for observations using natural language and get timeline context around the best match. Two modes: "auto" (default) automatically uses top result as timeline anchor; "interactive" returns top matches for you to choose from. This combines search + timeline into a single operation for faster context discovery.',inputSchema:c.object({query:c.string().describe("Natural language search query to find relevant observations"),mode:c.enum(["auto","interactive"]).default("auto").describe("auto: Automatically use top search result as timeline anchor. interactive: Show top N search results for manual anchor selection."),depth_before:c.number().min(0).max(50).default(10).describe("Number of timeline records before anchor (default: 10)"),depth_after:c.number().min(0).max(50).default(10).describe("Number of timeline records after anchor (default: 10)"),limit:c.number().min(1).max(20).default(5).describe("For interactive mode: number of top search results to display (default: 5)"),project:c.string().optional().describe("Filter by project name")}),handler:async i=>{try{let{query:n,mode:o="auto",depth_before:a=10,depth_after:d=10,limit:l=5,project:h}=i,u=[];if(U)try{console.error("[search-server] Using hybrid semantic search for timeline query");let p=await j(n,100);if(console.error(`[search-server] Chroma returned ${p.ids.length} semantic matches`),p.ids.length>0){let f=Date.now()-7776e6,m=p.ids.filter((b,_)=>{let E=p.metadatas[_];return E&&E.created_at_epoch>f});console.error(`[search-server] ${m.length} results within 90-day window`),m.length>0&&(u=x.getObservationsByIds(m,{orderBy:"date_desc",limit:o==="auto"?1:l}),console.error(`[search-server] Hydrated ${u.length} observations from SQLite`))}}catch(p){console.error("[search-server] Chroma query failed, falling back to FTS5:",p.message)}if(u.length===0&&(console.error("[search-server] Using FTS5 keyword search"),u=k.searchObservations(n,{orderBy:"relevance",limit:o==="auto"?1:l,project:h})),u.length===0)return{content:[{type:"text",text:`No observations found matching "${n}". Try a different search query.`}]};if(o==="interactive"){let p=[];p.push("# Timeline Anchor Search Results"),p.push(""),p.push(`Found ${u.length} observation(s) matching "${n}"`),p.push(""),p.push("To get timeline context around any of these observations, use the `get_context_timeline` tool with the observation ID as the anchor."),p.push(""),p.push(`**Top ${u.length} matches:**`),p.push("");for(let f=0;f<u.length;f++){let m=u[f],b=m.title||`Observation #${m.id}`,_=new Date(m.created_at_epoch).toLocaleString(),E=m.type?`[${m.type}]`:"";p.push(`${f+1}. **${E} ${b}**`),p.push(`   - ID: ${m.id}`),p.push(`   - Date: ${_}`),m.subtitle&&p.push(`   - ${m.subtitle}`),p.push(`   - Source: claude-mem://observation/${m.id}`),p.push("")}return{content:[{type:"text",text:p.join(`
`)}]}}else{let b=function(S){return new Date(S).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})},_=function(S){return new Date(S).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})},E=function(S){return new Date(S).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})},N=function(S){return S?Math.ceil(S.length/4):0};var e=b,t=_,r=E,s=N;let p=u[0];console.error(`[search-server] Auto mode: Using observation #${p.id} as timeline anchor`);let f=x.getTimelineAroundObservation(p.id,p.created_at_epoch,a,d,h),m=[...f.observations.map(S=>({type:"observation",data:S,epoch:S.created_at_epoch})),...f.sessions.map(S=>({type:"session",data:S,epoch:S.created_at_epoch})),...f.prompts.map(S=>({type:"prompt",data:S,epoch:S.created_at_epoch}))];if(m.sort((S,O)=>S.epoch-O.epoch),m.length===0)return{content:[{type:"text",text:`Found observation #${p.id} matching "${n}", but no timeline context available (${a} records before, ${d} records after).`}]};let T=[];T.push(`# Timeline for query: "${n}"`),T.push(`**Anchor:** Observation #${p.id} - ${p.title||"Untitled"}`),T.push(`**Window:** ${a} records before \u2192 ${d} records after | **Items:** ${m.length} (${f.observations.length} obs, ${f.sessions.length} sessions, ${f.prompts.length} prompts)`),T.push(""),T.push("**Legend:** \u{1F3AF} session-request | \u{1F534} bugfix | \u{1F7E3} feature | \u{1F504} refactor | \u2705 change | \u{1F535} discovery | \u{1F9E0} decision"),T.push("");let g=new Map;for(let S of m){let O=b(S.epoch);g.has(O)||g.set(O,[]),g.get(O).push(S)}let I=Array.from(g.entries()).sort((S,O)=>{let C=new Date(S[0]).getTime(),v=new Date(O[0]).getTime();return C-v});for(let[S,O]of I){T.push(`### ${S}`),T.push("");let C=null,v="",w=!1;for(let R of O){let F=R.type==="observation"&&R.data.id===p.id;if(R.type==="session"){w&&(T.push(""),w=!1,C=null,v="");let y=R.data,A=y.request||"Session summary",D=`claude-mem://session-summary/${y.id}`;T.push(`**\u{1F3AF} #S${y.id}** ${A} (${E(R.epoch)}) [\u2192](${D})`),T.push("")}else if(R.type==="prompt"){w&&(T.push(""),w=!1,C=null,v="");let y=R.data,A=y.prompt.length>100?y.prompt.substring(0,100)+"...":y.prompt;T.push(`**\u{1F4AC} User Prompt #${y.prompt_number}** (${E(R.epoch)})`),T.push(`> ${A}`),T.push("")}else if(R.type==="observation"){let y=R.data,A="General";A!==C&&(w&&T.push(""),T.push(`**${A}**`),T.push("| ID | Time | T | Title | Tokens |"),T.push("|----|------|---|-------|--------|"),C=A,w=!0,v="");let D="\u2022";switch(y.type){case"bugfix":D="\u{1F534}";break;case"feature":D="\u{1F7E3}";break;case"refactor":D="\u{1F504}";break;case"change":D="\u2705";break;case"discovery":D="\u{1F535}";break;case"decision":D="\u{1F9E0}";break}let M=_(R.epoch),J=y.title||"Untitled",H=N(y.narrative),ie=M!==v?M:"\u2033";v=M;let ae=F?" \u2190 **ANCHOR**":"";T.push(`| #${y.id} | ${ie} | ${D} | ${J}${ae} | ~${H} |`)}}w&&T.push("")}return{content:[{type:"text",text:T.join(`
`)}]}}}catch(n){return{content:[{type:"text",text:`Timeline query failed: ${n.message}`}],isError:!0}}}}],K=new he({name:"claude-mem-search",version:"1.0.0"},{capabilities:{tools:{}}});K.setRequestHandler(ge,async()=>({tools:oe.map(i=>({name:i.name,description:i.description,inputSchema:Te(i.inputSchema)}))}));K.setRequestHandler(be,async i=>{let e=oe.find(t=>t.name===i.params.name);if(!e)throw new Error(`Unknown tool: ${i.params.name}`);try{return await e.handler(i.params.arguments||{})}catch(t){return{content:[{type:"text",text:`Tool execution failed: ${t.message}`}],isError:!0}}});async function Ie(){let i=new _e;await K.connect(i),console.error("[search-server] Claude-mem search server started"),setTimeout(async()=>{try{console.error("[search-server] Initializing Chroma client...");let e=new Ee({command:"uvx",args:["chroma-mcp","--client-type","persistent","--data-dir",Z],stderr:"ignore"}),t=new fe({name:"claude-mem-search-chroma-client",version:"1.0.0"},{capabilities:{}});await t.connect(e),U=t,console.error("[search-server] Chroma client connected successfully")}catch(e){console.error("[search-server] Failed to initialize Chroma client:",e.message),console.error("[search-server] Falling back to FTS5-only search"),U=null}},0)}Ie().catch(i=>{console.error("[search-server] Fatal error:",i),process.exit(1)});
