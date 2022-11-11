bash init.sh

externProcessId=$$
node ./scripts/dev/optionsMenu.js;
indexVal=$?
if [ $indexVal -eq 0 ]; then
    echo "Exiting..."
    exit $indexVal
fi                  
echo "Log ID: ${externProcessId}"

network=$(jq -r '.network' params.json)
echo "Network: ${network}"

# for i in $(seq 1 $(jq -r '.websockets | length' params.json)); do 
node --trace-uncaught  --trace-warnings  ./scripts/buybot.js --index=${indexVal} --node-id=1 --run-id=${externProcessId}
# done