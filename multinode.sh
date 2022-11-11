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

processList=()
for i in $(seq 1 $(jq -r ".${network}.websockets | length" networkData.json)); do 
    node ./scripts/buybot.js --index=${indexVal} --node-id=$i --run-id=${externProcessId} --trace-warnings &
    p=$!
    processList+=($p)
done

trap 'endPIDs' INT

endPIDs() {
    echo
    for p in ${processList[@]}; do
        echo "Killing PID: $p"
        kill $p
    done
}

wait