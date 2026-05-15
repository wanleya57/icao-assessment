const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'icao.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
// Try to delete existing database with retry
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    // Also try to delete WAL and SHM files
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
  } catch (err) {
    console.log('Warning: Could not delete existing database, will overwrite tables');
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  DROP TABLE IF EXISTS event_records;
  DROP TABLE IF EXISTS assessment_records;
  DROP TABLE IF EXISTS phrase_library;
  DROP TABLE IF EXISTS observable_behaviors;
  DROP TABLE IF EXISTS competencies;
  DROP TABLE IF EXISTS training_sessions;
  DROP TABLE IF EXISTS pilots;
  DROP TABLE IF EXISTS instructors;

  CREATE TABLE instructors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password TEXT,
    name TEXT NOT NULL,
    employee_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE pilots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    employee_id TEXT,
    rank TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES instructors(id)
  );

  CREATE TABLE training_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_code TEXT UNIQUE NOT NULL,
    instructor_id INTEGER NOT NULL,
    pilot_id INTEGER,
    student_name TEXT NOT NULL,
    aircraft_type TEXT NOT NULL,
    task_type TEXT NOT NULL,
    flight_date TEXT NOT NULL,
    status TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (instructor_id) REFERENCES instructors(id),
    FOREIGN KEY (pilot_id) REFERENCES pilots(id)
  );

  CREATE TABLE competencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name_cn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_cn TEXT,
    description_en TEXT
  );

  CREATE TABLE observable_behaviors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competency_id INTEGER NOT NULL,
    code TEXT UNIQUE NOT NULL,
    name_cn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
  );

  CREATE TABLE event_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    competency_code TEXT NOT NULL,
    ob_code TEXT,
    competency_name TEXT NOT NULL,
    event_time TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    severity TEXT DEFAULT 'normal' CHECK(severity IN ('normal','serious','urgent')),
    evidence TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE phrase_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    text TEXT NOT NULL,
    instructor_id INTEGER,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instructor_id) REFERENCES instructors(id)
  );

  CREATE TABLE assessment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    competency_code TEXT NOT NULL,
    ob_code TEXT NOT NULL,
    level INTEGER NOT NULL CHECK(level IN (1, 2, 3, 4)),
    original_text TEXT,
    professional_text TEXT,
    evidence TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_sessions_instructor ON training_sessions(instructor_id);
  CREATE INDEX idx_sessions_status ON training_sessions(status);
  CREATE INDEX idx_events_session ON event_records(session_id);
  CREATE INDEX idx_events_competency ON event_records(competency_code);
  CREATE INDEX idx_events_ob ON event_records(ob_code);
  CREATE INDEX idx_phrases_category ON phrase_library(category);
  CREATE INDEX idx_obs_competency ON observable_behaviors(competency_id);

  CREATE TABLE login_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK(device_type IN ('mobile', 'pc')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES instructors(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_login_sessions_user ON login_sessions(user_id);
  CREATE INDEX idx_login_sessions_token ON login_sessions(token);

  CREATE TABLE pending_ai_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    results TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES instructors(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_pending_ai_user ON pending_ai_results(user_id);
`);

// CBTA 8 competencies (基于胜任力的培训和评估)
const competencies = [
  { code: 'PRO', name_cn: '程序的执行和遵守规章', name_en: 'Application of procedures and compliance with regulations', desc_cn: '根据已发布的操作说明和适用的规章，确定并应用适当的程序。' },
  { code: 'COM', name_cn: '沟通', name_en: 'Communication', desc_cn: '在正常和非正常情况下，在运行环境中通过适当方式进行沟通。' },
  { code: 'FPM-A', name_cn: '飞机飞行航径管理（自动化）', name_en: 'Aeroplane Flight Path Management, automation', desc_cn: '通过自动化控制飞行航径。' },
  { code: 'FPM-M', name_cn: '飞机飞行航径管理（人工操纵）', name_en: 'Aeroplane Flight Path Management, manual control', desc_cn: '通过人工操纵来控制飞行航径。' },
  { code: 'LTW', name_cn: '领导力和团队合作', name_en: 'Leadership and Teamwork', desc_cn: '影响他人为共同的目的作出贡献。进行合作以实现团队的目标。' },
  { code: 'PSD', name_cn: '解决问题和做出决策', name_en: 'Problem Solving and Decision Making', desc_cn: '发现先兆，缓解问题并作出决策。' },
  { code: 'SAW', name_cn: '情景意识和信息管理', name_en: 'Situation awareness and management of information', desc_cn: '感知、理解和管理信息并预测其对运行的影响。' },
  { code: 'WLM', name_cn: '工作量管理', name_en: 'Workload Management', desc_cn: '通过使用适当的资源对任务进行优先排序和分配来维持现有的工作负荷能力。' }
];

const insertComp = db.prepare('INSERT INTO competencies (code, name_cn, name_en, description_cn) VALUES (?, ?, ?, ?)');
const compIds = {};
const insertCompMany = db.transaction((comps) => {
  for (const c of comps) {
    const r = insertComp.run(c.code, c.name_cn, c.name_en, c.desc_cn);
    compIds[c.code] = r.lastInsertRowid;
  }
});
insertCompMany(competencies);

// Observable Behaviors (基于胜任力的培训和评估)
const observableBehaviors = [
  // PRO - 程序的执行和遵守规章
  { comp: 'PRO', code: 'OB 1.1', cn: '确定在哪里可以找到程序和规章', en: 'Identifies where to find procedures and regulations' },
  { comp: 'PRO', code: 'OB 1.2', cn: '及时应用相关的操作说明、程序和技术', en: 'Applies relevant operating instructions, procedures and techniques in a timely manner' },
  { comp: 'PRO', code: 'OB 1.3', cn: '遵循标准操作程序，除非更高的安全度要求适当的偏差', en: 'Follows SOPs unless a higher degree of safety dictates an appropriate deviation' },
  { comp: 'PRO', code: 'OB 1.4', cn: '正确操作飞机系统和相关设备', en: 'Operates aeroplane systems and associated equipment correctly' },
  { comp: 'PRO', code: 'OB 1.5', cn: '监控航空器系统状态', en: 'Monitors aircraft systems status' },
  { comp: 'PRO', code: 'OB 1.6', cn: '遵守适用的规章', en: 'Complies with applicable regulations' },
  { comp: 'PRO', code: 'OB 1.7', cn: '应用相关的程序知识', en: 'Applies relevant procedural knowledge' },

  // COM - 沟通
  { comp: 'COM', code: 'OB 2.1', cn: '确定接收人准备就绪并能够接收信息', en: 'Determines that the recipient is ready and able to receive information' },
  { comp: 'COM', code: 'OB 2.2', cn: '恰当地选择何时、如何以及与谁进行何种沟通', en: 'Selects appropriately what, when, how and with whom to communicate' },
  { comp: 'COM', code: 'OB 2.3', cn: '清晰、准确且简洁地传达信息', en: 'Conveys messages clearly, accurately and concisely' },
  { comp: 'COM', code: 'OB 2.4', cn: '确认接收人表明理解重要信息', en: 'Confirms that the recipient demonstrates understanding of important information' },
  { comp: 'COM', code: 'OB 2.5', cn: '在接收信息时主动倾听并表明理解', en: 'Listens actively and demonstrates understanding when receiving information' },
  { comp: 'COM', code: 'OB 2.6', cn: '询问相关而有效的问题', en: 'Asks relevant and effective questions' },
  { comp: 'COM', code: 'OB 2.7', cn: '通信中使用适当的升级手段来解决所发现的偏差', en: 'Uses appropriate escalation in communication to resolve identified deviations' },
  { comp: 'COM', code: 'OB 2.8', cn: '以与组织文化和社会文化相适应的方式使用和解读非语言沟通', en: 'Uses and interprets non-verbal communication in a manner appropriate to the organizational and social culture' },
  { comp: 'COM', code: 'OB 2.9', cn: '遵守标准无线电话用语和程序', en: 'Adheres to standard radiotelephone phraseology and procedures' },
  { comp: 'COM', code: 'OB 2.10', cn: '准确阅读、理解、解释和回应数据链英文报文', en: 'Accurately reads, interprets, constructs and responds to datalink messages in English' },

  // FPM-A - 飞机飞行航径管理（自动化）
  { comp: 'FPM-A', code: 'OB 3.1', cn: '使用适当的飞行管理、引导系统和自动化系统', en: 'Uses appropriate flight management, guidance systems and automation' },
  { comp: 'FPM-A', code: 'OB 3.2', cn: '监控和检测与预定飞行航径的偏差并采取适当行动', en: 'Monitors and detects deviations from the intended flight path and takes appropriate action' },
  { comp: 'FPM-A', code: 'OB 3.3', cn: '安全地管理飞行航径以达到最佳运行性能', en: 'Manages the flight path safely to achieve optimum operational performance' },
  { comp: 'FPM-A', code: 'OB 3.4', cn: '使用自动化保持预定飞行航径，同时管理其他任务和干扰', en: 'Maintains the intended flight path during flight using automation while managing other tasks and distractions' },
  { comp: 'FPM-A', code: 'OB 3.5', cn: '及时选择适宜的自动化等级和模式', en: 'Selects appropriate level and mode of automation in a timely manner considering phase of flight and workload' },
  { comp: 'FPM-A', code: 'OB 3.6', cn: '有效监控自动化系统，包括接通和自动模式转换', en: 'Effectively monitors automation, including engagement and automatic mode transitions' },

  // FPM-M - 飞机飞行航径管理（人工操纵）
  { comp: 'FPM-M', code: 'OB 4.1', cn: '精确、平稳地人工操纵航空器', en: 'Controls the aircraft manually with accuracy and smoothness as appropriate to the situation' },
  { comp: 'FPM-M', code: 'OB 4.2', cn: '监控和检测偏离预定飞行航径的偏差并采取适当行动', en: 'Monitors and detects deviations from the intended flight path and takes appropriate action' },
  { comp: 'FPM-M', code: 'OB 4.3', cn: '利用飞机姿态、速度和推力，以及导航信号或目视信息人工操纵飞机', en: 'Manually controls the aeroplane using the relationship between aeroplane attitude, speed and thrust, and navigation signals or visual information' },
  { comp: 'FPM-M', code: 'OB 4.4', cn: '安全地管理飞行航径以达到最佳运行性能', en: 'Manages the flight path safely to achieve optimum operational performance' },
  { comp: 'FPM-M', code: 'OB 4.5', cn: '人工操纵飞行期间保持预定飞行航径，同时管理其他任务和干扰', en: 'Maintains the intended flight path during manual flight while managing other tasks and distractions' },
  { comp: 'FPM-M', code: 'OB 4.6', cn: '使用适当的飞行管理与引导系统', en: 'Uses appropriate flight management and guidance systems, as installed and applicable to the conditions' },
  { comp: 'FPM-M', code: 'OB 4.7', cn: '有效监控飞行引导系统，包括接通和自动模式转换', en: 'Effectively monitors flight guidance systems including engagement and automatic mode transitions' },

  // LTW - 领导力和团队合作
  { comp: 'LTW', code: 'OB 5.1', cn: '鼓励团队参与和开放式沟通', en: 'Encourages team participation and open communication' },
  { comp: 'LTW', code: 'OB 5.2', cn: '表现出主动性并在需要时提供指导', en: 'Demonstrates initiative and provides direction when required' },
  { comp: 'LTW', code: 'OB 5.3', cn: '让他人参与计划', en: 'Engages others in planning' },
  { comp: 'LTW', code: 'OB 5.4', cn: '考虑他人的意见', en: 'Considers inputs from others' },
  { comp: 'LTW', code: 'OB 5.5', cn: '建设性地给予和接收反馈', en: 'Gives and receives feedback constructively' },
  { comp: 'LTW', code: 'OB 5.6', cn: '以建设性的方式处理和解决冲突与分歧', en: 'Addresses and resolves conflicts and disagreements in a constructive manner' },
  { comp: 'LTW', code: 'OB 5.7', cn: '在需要时行使决定性领导权', en: 'Exercises decisive leadership when required' },
  { comp: 'LTW', code: 'OB 5.8', cn: '接受决策和行动的责任', en: 'Accepts responsibility for decisions and actions' },
  { comp: 'LTW', code: 'OB 5.9', cn: '执行所下达的指示', en: 'Carries out instructions when directed' },
  { comp: 'LTW', code: 'OB 5.10', cn: '采用有效的干预策略来解决发现的偏差', en: 'Applies effective intervention strategies to resolve identified deviations' },
  { comp: 'LTW', code: 'OB 5.11', cn: '应对文化和语言方面的挑战', en: 'Manages cultural and language challenges, as applicable' },

  // PSD - 解决问题和做出决策
  { comp: 'PSD', code: 'OB 6.1', cn: '及时识别、评估和管理威胁和差错', en: 'Identifies, assesses and manages threats and errors in a timely manner' },
  { comp: 'PSD', code: 'OB 6.2', cn: '从适当的渠道寻求准确和充分的信息', en: 'Seeks accurate and adequate information from appropriate sources' },
  { comp: 'PSD', code: 'OB 6.3', cn: '查明并验证出现什么差错，原因在哪里', en: 'Identifies and verifies what and why things have gone wrong, if appropriate' },
  { comp: 'PSD', code: 'OB 6.4', cn: '坚持不懈地解决问题，同时把安全放在优先地位', en: 'Perseveres in working through problems while prioritizing safety' },
  { comp: 'PSD', code: 'OB 6.5', cn: '确定并考虑合适的选项', en: 'Identifies and considers appropriate options' },
  { comp: 'PSD', code: 'OB 6.6', cn: '采用适宜且及时的决策技巧', en: 'Applies appropriate and timely decision-making techniques' },
  { comp: 'PSD', code: 'OB 6.7', cn: '根据需要监控、审查和调整决策', en: 'Monitors, reviews and adapts decisions as required' },
  { comp: 'PSD', code: 'OB 6.8', cn: '在缺乏指导和程序的情况下善于变通', en: 'Adapts when faced with situations where no guidance or procedure exists' },
  { comp: 'PSD', code: 'OB 6.9', cn: '在遇到意外事件时表现出快速恢复能力', en: 'Demonstrates resilience when encountering an unexpected event' },

  // SAW - 情景意识和信息管理
  { comp: 'SAW', code: 'OB 7.1', cn: '监控和评估飞机及其系统的状态', en: 'Monitors and assesses the state of the aeroplane and its systems' },
  { comp: 'SAW', code: 'OB 7.2', cn: '监控和评估飞机的能量状态及其预期的飞行航径', en: 'Monitors and assesses the aeroplane\'s energy state, and its anticipated flight path' },
  { comp: 'SAW', code: 'OB 7.3', cn: '监控和评估可能影响运行的一般环境', en: 'Monitors and assesses the general environment as it may affect the operation' },
  { comp: 'SAW', code: 'OB 7.4', cn: '验证信息的准确性并检查严重差错', en: 'Validates the accuracy of information and checks for gross errors' },
  { comp: 'SAW', code: 'OB 7.5', cn: '保持对参与运行的人员及其按预期表现的能力的了解', en: 'Maintains awareness of the people involved in or affected by the operation and their capacity to perform as expected' },
  { comp: 'SAW', code: 'OB 7.6', cn: '根据与威胁和差错相关的潜在风险制定有效的应急预案', en: 'Develops effective contingency plans based upon potential risks associated with threats and errors' },
  { comp: 'SAW', code: 'OB 7.7', cn: '对情境意识降低的迹象做出反应', en: 'Responds to indications of reduced situational awareness' },

  // WLM - 工作量管理
  { comp: 'WLM', code: 'OB 8.1', cn: '在所有情况下都实施自我控制', en: 'Exercises self-control in all situations' },
  { comp: 'WLM', code: 'OB 8.2', cn: '对各项任务进行有效的计划、优先排序和时间安排', en: 'Plans, prioritizes and schedules appropriate tasks effectively' },
  { comp: 'WLM', code: 'OB 8.3', cn: '在执行任务时有效管理时间', en: 'Manages time efficiently when carrying out tasks' },
  { comp: 'WLM', code: 'OB 8.4', cn: '提供和给予援助', en: 'Offers and gives assistance' },
  { comp: 'WLM', code: 'OB 8.5', cn: '委派任务', en: 'Delegates tasks' },
  { comp: 'WLM', code: 'OB 8.6', cn: '适当时寻求和接受援助', en: 'Seeks and accepts assistance, when appropriate' },
  { comp: 'WLM', code: 'OB 8.7', cn: '认真对行动进行监督、审查和交叉检查', en: 'Monitors, reviews and cross-checks actions conscientiously' },
  { comp: 'WLM', code: 'OB 8.8', cn: '验证任务的完成是否达到预期成果', en: 'Verifies that tasks are completed to the expected outcome' },
  { comp: 'WLM', code: 'OB 8.9', cn: '对中断、干扰、变化和故障进行有效管理和复原', en: 'Manages and recovers from interruptions, distractions, variations and failures effectively while performing tasks' }
];

const insertOB = db.prepare('INSERT INTO observable_behaviors (competency_id, code, name_cn, name_en) VALUES (?, ?, ?, ?)');
const insertOBMany = db.transaction((obs) => {
  for (const ob of obs) {
    insertOB.run(compIds[ob.comp], ob.code, ob.cn, ob.en);
  }
});
insertOBMany(observableBehaviors);

// Default phrase library
const defaultPhrases = [
  { category: '程序的执行和遵守规章', text: '未按检查单执行操作' },
  { category: '程序的执行和遵守规章', text: '偏离标准操作程序' },
  { category: '程序的执行和遵守规章', text: '未遵守空中交通管制指令' },
  { category: '沟通', text: '无线电通信用语不规范' },
  { category: '沟通', text: '未及时报告飞行状态变化' },
  { category: '沟通', text: '复诵/听取指令不完整' },
  { category: '沟通', text: '机组内部信息传递不及时' },
  { category: '飞机飞行航径管理（自动化）', text: '未及时选择适当的自动化模式' },
  { category: '飞机飞行航径管理（自动化）', text: '对自动化模式转换监控不足' },
  { category: '飞机飞行航径管理（人工操纵）', text: '航向偏出许可范围' },
  { category: '飞机飞行航径管理（人工操纵）', text: '高度保持不稳定' },
  { category: '飞机飞行航径管理（人工操纵）', text: '进近轨迹偏差过大' },
  { category: '领导力和团队合作', text: '未有效利用机组资源' },
  { category: '领导力和团队合作', text: '交叉检查不到位' },
  { category: '领导力和团队合作', text: '未明确分配任务职责' },
  { category: '解决问题和做出决策', text: '未及时识别威胁和差错' },
  { category: '解决问题和做出决策', text: '决策犹豫不决' },
  { category: '解决问题和做出决策', text: '未考虑所有可行选项' },
  { category: '情景意识和信息管理', text: '未及时识别飞行态势变化' },
  { category: '情景意识和信息管理', text: '对周围交通缺乏警觉' },
  { category: '情景意识和信息管理', text: '未注意高度/航向偏差' },
  { category: '情景意识和信息管理', text: '对气象条件变化反应迟缓' },
  { category: '工作量管理', text: '高负荷时遗漏关键步骤' },
  { category: '工作负荷管理', text: '注意力分配不当' },
  { category: '工作量管理', text: '任务优先排序不合理' }
];

const insertPhrase = db.prepare('INSERT INTO phrase_library (category, text, is_default) VALUES (?, ?, 1)');
const insertPhraseMany = db.transaction((phrases) => {
  for (const p of phrases) insertPhrase.run(p.category, p.text);
});
insertPhraseMany(defaultPhrases);

// Default admin user
const hash = bcrypt.hashSync('<YOUR_PASSWORD>', 10);
db.prepare('INSERT INTO instructors (phone, password, name, employee_id) VALUES (?, ?, ?, ?)')
  .run('<YOUR_PHONE>', hash, '<YOUR_NAME>', 'INS001');

// Sample pilot
db.prepare('INSERT INTO pilots (name, employee_id, rank, created_by) VALUES (?, ?, ?, ?)')
  .run('<YOUR_STUDENT_NAME>', 'PIL001', '学员', 1);

console.log('Database initialized successfully');
console.log(`Competencies: ${competencies.length}`);
console.log(`Observable Behaviors: ${observableBehaviors.length}`);
console.log(`Default phrases: ${defaultPhrases.length}`);
console.log('Default login: <YOUR_PHONE> / <YOUR_PASSWORD>');
db.close();
