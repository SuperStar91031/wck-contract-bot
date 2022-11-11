if [ -d logs ]   # For file "if [ -f /home/rama/file ]"
then
    echo "logs directory found."
else
    mkdir logs
fi

if [ -d cache ]   # For file "if [ -f /home/rama/file ]"
then
    echo "cache directory found."
else
    mkdir cache
fi