

const axios = require('axios');
const fs = require('fs-extra');

// --- BATCH CONFIGURATION ---
const BATCH_SIZE = 1;     
const WAIT_TIME = 3000;    

const Adapters = {
    // UPDATED HACKERRANK ADAPTER
    hackerrank: async (user) => {
        try {
            // We switch to the 'recent_challenges' endpoint which is more public
            const res = await axios.get(`https://www.hackerrank.com/rest/hackers/${user}/recent_challenges?limit=1000`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': `https://www.hackerrank.com/${user}`
                },
                timeout: 10000
            });

            // This returns a list of unique challenges solved. 
            // We use a Set to ensure we only count unique solved problems.
            if (res.data && res.data.models) {
                const uniqueSolved = new Set(res.data.models.map(m => m.ch_id));
                return uniqueSolved.size;
            }
            return 0;
        } catch (e) {
            console.log(`❌ HR Error for ${user}: ${e.response?.status || e.message}`);
            return 0;
        }
    },

    leetcode: async (user) => {
        const query = `query { matchedUser(username: "${user}") { submitStatsGlobal { acSubmissionNum { difficulty count } } } }`;
        try {
            const res = await axios.post("https://leetcode.com/graphql", { query }, { timeout: 10000 });
            return res.data?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum?.find(s => s.difficulty === 'All')?.count || 0;
        } catch { return 0; }
    },

    codeforces: async (user) => {
        try {
            const res = await axios.get(`https://codeforces.com/api/user.status?handle=${user}`);
            const solved = new Set(res.data.result.filter(s => s.verdict === "OK").map(s => s.problem.name));
            return solved.size;
        } catch { return 0; }
    },

    atcoder: async (user) => {
        try {
            const res = await axios.get(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/ac_rank?user=${user}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            return res.data?.count || 0;
        } catch { return 0; }
    }
};

async function runScraper() {
    try {
        const students = await fs.readJson('students_mock.json');
        const results = [];

        for (let i = 0; i < students.length; i += BATCH_SIZE) {
            const batch = students.slice(i, i + BATCH_SIZE);
            console.log(`📦 Processing Batch ${Math.floor(i/BATCH_SIZE) + 1}...`);

            const batchResults = await Promise.all(batch.map(async (student) => {
                const [lc, cf, ac, hr] = await Promise.all([
                    Adapters.leetcode(student.handles.leetcode),
                    Adapters.codeforces(student.handles.codeforces),
                    Adapters.atcoder(student.handles.atcoder),
                    Adapters.hackerrank(student.handles.hackerrank)
                ]);

                return {
                    name: student.name,
                    handles: student.handles,
                    counts: { leetcode: lc, codeforces: cf, atcoder: ac, hackerrank: hr, total: lc + cf + ac + hr }
                };
            }));

            results.push(...batchResults);
            await fs.writeJson('final_leaderboard.json', results, { spaces: 2 });

            if (i + BATCH_SIZE < students.length) {
                await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
            }
        }
        console.table(results.map(r => ({ Name: r.name, LC: r.counts.leetcode, HR: r.counts.hackerrank, Total: r.counts.total })));
    } catch (err) {
        console.log("Error:", err.message);
    }
}

runScraper();