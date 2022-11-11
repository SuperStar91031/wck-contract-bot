var rp = require("request-promise");

const CONTRACT_ADDRESS = "0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413";
const API_LEY = "";
const main = async () => {
  let res = await rp(
    `https://api.bscscan.com/api?module=contract&action=getabi&address=${CONTRACT_ADDRESS}&apikey=${API_LEY}`,
    { json: true }
  );
  console.log(res);
  //     (err, res, body) => {
  //       if (err) {
  //         return console.log(err);
  //       }
  //       console.log(body);
  //     }
  //   );
};

main();
