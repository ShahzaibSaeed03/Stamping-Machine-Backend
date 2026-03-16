FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install -g opentimestamps

COPY . .

EXPOSE 8080

CMD ["npm","start"]