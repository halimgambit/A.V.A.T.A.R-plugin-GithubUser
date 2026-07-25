import fetch from "node-fetch";
import * as url from 'url';
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const CACHE_FILE = path.join(__dirname, "github_cache.json");

const loadCache = async () => {
    try {
        if (!existsSync(CACHE_FILE)) return {};
        const data = await fs.readFile(CACHE_FILE, "utf8");
        return JSON.parse(data);
    } catch {
        return {};
    }
};

const saveCache = async (cache) => {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
    } catch (err) {
        error("GithubUser SaveCache Error:", err.message);
    }
};

export async function cron() {
    try {
        info("GithubUser: Vérification automatique des mises à jour GitHub...");
        const L = await Avatar.lang.getPak('GithubUser',Config.language);
        await checkPluginUpdates(L);
    } catch (err) {
        error("GithubUser Cron Error:", err.message);
    }
}

const checkPluginUpdates = async (L) => {

    const client = Config.modules.GithubUser.client;
    const users = Config.modules?.GithubUser?.users || {};
    const cache = await loadCache();
    let cacheUpdated = false;

    for (const key of Object.keys(users)) {
        const userName = users[key];
        const targetUrl = `https://api.github.com/users/${userName}/repos?sort=updated&per_page=30`;

        try {
            const response = await fetch(targetUrl, {
                headers: { 
                    "User-Agent": "AVATAR-Framework-Plugin",
                    "Accept": "application/vnd.github.v3+json"
                }
            });

            if (response.status === 403) {
                error("GithubUser: Limite d'appels API GitHub atteinte (Rate limit).");
                Avatar.speak(L.get("speech.rateLimit"), client);
                break;
            }

            if (!response.ok) continue;

            const repos = await response.json();
            const plugins = repos.filter(r => r.name && r.name.startsWith("A.V.A.T.A.R-plugin-"));

            for (const repo of plugins) {
                const name = repo.name;
                const updated = repo.updated_at;

                if (!cache[name]) {
                    cache[name] = updated;
                    cacheUpdated = true;
                    continue;
                }
                
                if (cache[name] !== updated) {
                cache[name] = updated;
                cacheUpdated = true;
                infoGreen(`Mise à jour détectée : ${name}`);
                const cleanName = name.replace("A.V.A.T.A.R-plugin-", "");
                Avatar.speak(L.get(["speech.updated", cleanName]), client);
                }
            }
        } catch (err) {
            error("GithubUser UpdateCheck Error:", err.message);
        }
    }

    if (cacheUpdated) {
        await saveCache(cache);
    }
};

export async function init() {
    info("GithubUser: initialisé (cron actif)");
     await Avatar.lang.addPluginPak('GithubUser');
}

let Locale;

export async function action(data, callback) {
    try {

        Locale = await Avatar.lang.getPak('GithubUser', data.language);

        const tblActions = {
            getUser: () => getUser(data, data.client, Locale)                    
        };
        
        info("GithubUser:", data.action.command, "from", data.client);
            
        await tblActions[data.action.command]();

    } catch (err) {
        if (data.client) Avatar.Speech.end(data.client);
        if (err.message) error("GithubUser Error:", err.message);
         Avatar.speak("GithubUser Error:", err.message, data.client);
    }   

    callback();
}

const getUser = async (data, client, Locale) => {
    const sentence = (data.rawSentence || data.action?.sentence || "").toLowerCase();
    const users = Config.modules?.GithubUser?.users || {};

    const foundUserKey = Object.keys(users)
        .sort((a, b) => b.length - a.length)
        .find(key => sentence.includes(key.toLowerCase()));

    if (!foundUserKey) {
        infoOrange("Je ne connais pas cet utilisateur GitHub.");
        Avatar.speak(Locale.get("speech.unknownUser"), client);
        return;
    }

    const userName = users[foundUserKey];
    const targetUrl = `https://api.github.com/users/${userName}/repos?sort=updated&per_page=30`; 

    try {
        const response = await fetch(targetUrl, {
            headers: { 
                'User-Agent': 'AVATAR-Framework-Plugin',
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const repos = await response.json();

        if (!Array.isArray(repos) || !repos.length) {
            Avatar.speak(Locale.get(["speech.noRepository", userName]), client);
            return;
        }

        const plugins = repos.filter(r => r.name && r.name.startsWith("A.V.A.T.A.R-plugin-")).slice(0, 3).map(r => {
                let name = r.name.replace("A.V.A.T.A.R-plugin-", "");
                name = name.replace(/-/g, " ");
                name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
                return name;
            });

        if (!plugins.length) {
            Avatar.speak(Locale.get(["speech.noPlugin", foundUserKey]), client);
            return;
        }

        const repoNames = plugins.join(", ");

        infoGreen(`Les derniers plugins de ${foundUserKey} sont : ${repoNames}`);
        Avatar.speak(Locale.get(["speech.lastPlugins", foundUserKey, repoNames]), client);

    } catch (err) {
        error("GithubUser API Error:", err.message);
        Avatar.speak(Locale.get("speech.errorApi"), client);
    }
};

