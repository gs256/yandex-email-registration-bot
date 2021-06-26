const puppeteer = require('puppeteer');
const axios = require('axios');
const { Solver } = require('./solver');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const { clear } = require('console');

tasks = [];

(async () => {
	const browser = await puppeteer.launch({
		headless: false, 
		defaultViewport: null, 
		args: [
    		'--no-proxy-server',
    		"--proxy-server='direct://'",
    		"--proxy-bypass-list=*",
	]});

	document.querySelector('button')
	.addEventListener('click', async () => {
		const page = await browser.newPage();
		const imgSearchPage = await browser.newPage(); 

		while (true) {
			const credentials = await getCredentialsFromAPI();
			console.log(credentials);
			await register(page, imgSearchPage, credentials);
		}
	});

	ipcRenderer.on('main-msg', (event, arg) => {
        console.log(arg);
    });
  	// await browser.close();
})();


async function register(page, imgSearchPage, credentials) {
	await page.bringToFront();
  	await page.goto('https://passport.yandex.ru/registration/mail?from=mail&origin=home_desktop_ru');

	// Wait for the form to load
	await page.waitForSelector('input#firstname');

	// Type first and last name
	await page.type('input#firstname', credentials.firstName);
	await page.type('input#lastname', credentials.lastName);
	
	// Type email address
	await page.type('input#login', credentials.username);
	
	// Type password
	await page.type('input#password', credentials.password);
	await page.type('input#password_confirm', credentials.password);

	// Chose secret question instead of phone
	(await (await page.$('.toggle-link.link_has-no-phone')).$('span')).click();

	// Type secret question answer 
	await page.waitForSelector('.Select2-Control');
	const question = await (await page.$('.Select2-Control')).$eval('option', el => el.innerText);
	credentials.secretQuestion = question;
	await page.type('input#hint_answer', credentials.questionAnswer);

	isCaptchaSolved = false;

	while (!isCaptchaSolved) {
		await page.waitForSelector('button[type="submit"]');
		await page.waitForSelector('img.captcha__image');
		const captchaImageSrc = await getCaptchaImageSrc(page);

		const imageSearchUrl = generateImageSearchUrl(captchaImageSrc);
		await imgSearchPage.bringToFront();
		await imgSearchPage.goto(imageSearchUrl);

		const maxTimeout = 3000;
		await Promise.any([
			imgSearchPage.waitForSelector('.CbirItem.CbirOcr button'),
			imgSearchPage.waitForSelector('div.CbirOcr-Text'),
			sleep(maxTimeout)
		]);

		let captchaText = String();
		let gotText = false;

		// Get recognized text
		if (await imgSearchPage.$('.CbirItem.CbirOcr button')) {
			console.log('found the button');
			await imgSearchPage.focus('.CbirItem.CbirOcr button');
			(await imgSearchPage.$('.CbirItem.CbirOcr button')).click();

			await Promise.any([
				imgSearchPage.waitForSelector('.CbirOcr-Content .CbirOcr-ErrorMessage'),
				imgSearchPage.waitForSelector('div.CbirOcr-Text')
			]);

			if (await imgSearchPage.$('div.CbirOcr-Text')) { 
				console.log('got text');
				captchaText = await getRecognizedCaptchaText(imgSearchPage);
				gotText = true;
			} else {
				console.log('got error message');
				await page.bringToFront();
				await changeCaptchaImage(page);
			}
		} else if (await imgSearchPage.$('div.CbirOcr-Text')) {
			console.log('found the text');
			captchaText = await getRecognizedCaptchaText(imgSearchPage);
			gotText = true;
		} else {
			console.log('nothing found');
			await page.bringToFront();
			await changeCaptchaImage(page);
		}

		if (gotText) {
			// Type capthca text
			await page.bringToFront();
			await page.focus('input[name="captcha"]');
			await page.keyboard.down('Control');
			await page.keyboard.press('A');
			await page.keyboard.up('Control');
			await page.keyboard.press('Backspace');
			await page.type('input[name="captcha"]', captchaText);

			// Click register button
			(await page.$('button[type="submit"]')).click();

			if (await passedCaptcha(page)) {
				await saveCredentialsToFile(credentials);
				
				await page.waitForSelector('span.registration__avatar-btn a');
				await page.focus('span.registration__avatar-btn a');
				(await page.$('span.registration__avatar-btn a')).click();
				await sleep(1000);

				isCaptchaSolved = true;
				// await sleep(1000);
				await clearCookies(page);
				await clearCookies(imgSearchPage);
			}
		}
	}
}

async function clearCookies(page) {
	const client = await page.target().createCDPSession();
	await client.send('Network.clearBrowserCookies');
	await client.send('Network.clearBrowserCache');
}

function generateImageSearchUrl(imageUrl) {
	const urlParameter = new URLSearchParams(`url=${imageUrl}`).toString()
	const searchUrl = `https://yandex.ru/images/search?${urlParameter}&rpt=imageview`;
	return searchUrl;
}

async function changeCaptchaImage(page) {
	let previousCaptchaSrc = await getCaptchaImageSrc(page);

	await (await page.$('div.captcha__reload')).click();

	return await new Promise((resolve, reject) => {
		const interval = setInterval(async () => {
			const currentCapthcaSrc = await getCaptchaImageSrc(page); 
			if (currentCapthcaSrc != previousCaptchaSrc) {
				clearInterval(interval);
				resolve();
			}
		}, 5);
	});
}

async function getCaptchaImageSrc(page) {
	const captchaImageSelector = 'img.captcha__image';
	await page.waitForSelector(captchaImageSelector);
	return await page.$eval('img.captcha__image', img => img.src);
}

async function getRecognizedCaptchaText(page) {
	let captchaText = await page.$eval('div.CbirOcr-Text', el => el.innerText);
	captchaText = captchaText.replace('\n', ' ');
	return captchaText;
}

async function waitForCbirPanelToShow(page, timeout) {
	while (await page.$eval('.cbir-panel', el => el.style.display == 'none')) {
		sleep(timeout);
	}
}

async function passedCaptcha(page) {
	let registered = false;

	const goneToAccountPagePromise = new Promise((resolve, reject) => {
		page.on('response', response => {
		   	if (response.url().includes('avatar')) {
				   registered = true;
				   resolve();
			}
		});
	});

	await Promise.any([
		page.waitForSelector('.captcha-wrapper .reg-field__popup .form__popup-error'),
		goneToAccountPagePromise
	]);

	if (registered)
		return true;

	return false;
}

async function checkCaptchaMatch(page) {
	return await new Promise((resolve, reject) => {
		page.on('response', response => {
   			if (response.url().endsWith('checkHuman')) {
				if (response.json().status != 'error')
					resolve(true);
				resolve(false);
		   	}
  		});
	});
}


async function setElementValue(selector, value) {
	await page.evaluate((selector, value) => {
		document.querySelector(selector).value = value;
	}, selector, value);
}


function parseName(name) {
	let words = name.split(' ');
	
	words.forEach(word => {
		if (word.includes('.')) {
			words.splice(0, 1); 
		}
	});

	return {firstName: words[0], lastName: words[1]};
}


async function getCredentialsFromAPI() {
	const apiUrl = 'https://api.namefake.com/english-united-states/male/'; 
	let credentials = {};

	const newPerson = (await axios.get(apiUrl)).data;

	// Assign first and last name
	const parsedName = parseName(newPerson.name);
	credentials.firstName = parsedName.firstName;
	credentials.lastName = parsedName.lastName;

	// Assign email data
	credentials.username = newPerson.email_u + randomNumber(1000, 9999).toString();
	// credentials.emailProvider = getRandomEmailProvider();

	let password = newPerson.password;
	const disallowedSymbolRegex = /[^a-zA-Z0-9`!@#$%^&*()_=+\[\]{};:"\|,.]/g;
	const substituteSymbol = '_';
	password = password.replace(disallowedSymbolRegex, substituteSymbol);
	credentials.password = password;

	credentials.registered = false;

	credentials.secretQuestion = String();
	credentials.questionAnswer = newPerson.username;

	return credentials;
}

function saveCredentialsToFile(credentials) {
	fs.appendFileSync('accounts.txt', JSON.stringify(credentials) + ',');
}

function parseBirthData(birthData) {
	const data = birthData.split('-');
	return {day: data[2], month: data[1], year: data[0]};
}


function getRandomEmailProvider() {
	const providers = [
		'@mail.ru',
		'@bk.ru',
		'@inbox.ru',
		'@list.ru'
	];

	return getRandomElement(providers);
}

function randomNumber(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(array) {
	const index = Math.floor(Math.random() * array.length);	
	return array[index];
}


async function sleep(time) {
	return await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			resolve();	
		}, time);
	});
}