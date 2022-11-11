const fs = require("fs");

let nodeID, runID, fileWriter;
let date = new Date();

const initLogger = (_nodeID, _runID) => {
  nodeID = _nodeID;
  runID = _runID;
  if (nodeID == 0)
    fs.writeFileSync(`./cache/${runID}.json`, '{"winnerNode": null}');
  let folderName = `${String(date.getMonth()).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}_${String(_runID).padStart(3, "0")}`;
  try {
    fs.mkdirSync(`./logs/${folderName}`);
  } catch (e) {}
  fileWriter = new console.Console(
    fs.createWriteStream(`./logs/${folderName}/${_nodeID + 1}.txt`)
  );
};

// Custom Log function to print timestamp and NodeIDs
const Log = (...args) => {
  let date = new Date();
  console.log(
    `[${String(date.getHours()).padStart(2, "0")}: ${String(
      date.getMinutes()
    ).padStart(2, "0")}: ${String(date.getSeconds()).padStart(
      2,
      "0"
    )}: ${String(date.getMilliseconds()).padStart(3, "0")}] NODE ${
      nodeID + 1
    }: `,
    ...args
  );
  fileWriter.log(
    `[${String(date.getHours()).padStart(2, "0")}: ${String(
      date.getMinutes()
    ).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}:${String(
      date.getMilliseconds()
    ).padStart(3, "0")}] NODE ${nodeID + 1}: `,
    ...args
  );
};

// Logs the args and exits
const LogFatalException = (...args) => {
  Log(...args, "Exiting...");
  process.exit(1);
};

module.exports = { initLogger, Log, LogFatalException };
