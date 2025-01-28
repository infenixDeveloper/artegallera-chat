const http = require("./src/app.js");

http.listen(process.env.WSPORT || 3001, () => {
  console.log(`Server is listening at ${process.env.WSPORT || 3001}`);
});