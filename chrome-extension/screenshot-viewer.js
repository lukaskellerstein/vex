const key = new URLSearchParams(location.search).get("key");
if (key) {
  chrome.storage.local.get(key, (data) => {
    const base64 = data[key];
    if (base64) {
      document.getElementById("img").src = "data:image/jpeg;base64," + base64;
      document.getElementById("img").style.display = "block";
      document.getElementById("loading").style.display = "none";
      chrome.storage.local.remove(key);
    } else {
      document.getElementById("loading").textContent = "Screenshot not found.";
    }
  });
} else {
  document.getElementById("loading").textContent = "No screenshot key provided.";
}
