// Importing a handler module registers its routes with the router.
import "./handlers/auth.js";
import "./handlers/preferences.js";
import "./handlers/courses.js";
import "./handlers/tasks.js";
import "./handlers/sessions.js";
import "./handlers/warnings.js";
import "./handlers/catalog.js";
import "./handlers/trends.js";
import "./handlers/department.js";
import "./handlers/materials.js";
import "./handlers/reminders.js";
import "./handlers/cron.js";
import "./handlers/account.js";
export { handle } from "./router.js";
