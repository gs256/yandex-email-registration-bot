const { ipcRenderer } = require('electron');


class Task {

	constructor() {
		this.isFree = true;
		this.captcha = new Captcha();
		this.captchaImage = document.querySelector('.captcha-image');
		this.captchaInput = document.querySelector('.captcha-input');
		this.captchaSendBtn = document.querySelector('.captcha-send-btn');
	}

	async getCaptchaText(captchaImgSrc) {
		this.isFree = false;
		this.captcha.imageSrc = captchaImgSrc;

		const captchaText = await new Promise((resolve, reject) => {
			this.showCaptchaImage();

			this.captchaSendBtn
			.addEventListener('click', () => {
				this.isFree = true;
				resolve(this.captchaInput.value);
			});
		});

		return captchaText;
	}

	async showCaptchaImage() {
		this.captchaImage.src = this.captcha.imageSrc;	
	}
}


class Captcha {

	constructor() {
		this.imageSrc = String();
		this.solved = false;
	}

}


exports.Task = Task;