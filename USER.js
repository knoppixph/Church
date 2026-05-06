import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCguysIlysXrxoUVzvxwIegkkzjWHxJ9_s",
    authDomain: "something-951af.firebaseapp.com",
    databaseURL: "https://something-951af-default-rtdb.firebaseio.com/",
    projectId: "something-951af",
    storageBucket: "something-951af.appspot.com",
    messagingSenderId: "473657927594",
    appId: "1:473657927594:web:c62149f5b6a77ae8182dd3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const userTable = document.getElementById("userTable");

// LOAD USERS FROM FIREBASE
onValue(ref(db, "users"), (snapshot) => {
    userTable.innerHTML = "";

    snapshot.forEach(child => {
        const u = child.val();

        const row = `
            <tr>
                <td>${u.name}</td>
                <td>${u.department || "—"}</td>
                <td>${u.role || "user"}</td>
                <td>${u.itemsBorrowed || 0}</td>
                <td>${u.balance ?? 0}</td>
            </tr>
        `;

        userTable.innerHTML += row;
    });
});
