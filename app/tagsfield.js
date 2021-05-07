function validateTag(value, tagsValues) {
    if (
        value.length > 0 &&
        value.length <= 50 &&
        !tagsValues.includes(value)
    ) {
        return true;
    }
}

class Tagsfield {
    constructor(el, alpineApp) {
        if (el.classList.contains("ready")) {
            return;
        }
        el.classList.add("ready");

        this.alpineApp = alpineApp;

        this.el = el;
        this.input = el.querySelector("input[type=\"hidden\"]");
        this.editable = el.querySelector("span[contenteditable]");

        el.addEventListener("click", () => this.editable.focus());
        this.editable.addEventListener("focus", () => el.classList.add("is-focused"));
        this.editable.addEventListener("blur", () => el.classList.remove("is-focused"));
        this.editable.addEventListener("keydown", this.onKeyDown.bind(this));
        this.editable.addEventListener("paste", event => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            const tmp = document.createElement("div");

            tmp.innerHTML = text;
            document.execCommand("insertHTML", false, tmp.textContent.trim());
        });

        // Load tags from input.value
        this.input.value.split(",").filter(v => v.length > 0).forEach(v => this.addTag(v));
    }

    removeTag(tag) {
        const values = this.input.value.split(",");
        const index = [...this.el.children].indexOf(tag);

        values.splice(index, 1);
        this.input.value = values.join(",");
        this.el.removeChild(tag);
        this.input.dispatchEvent(new Event("change"));
    }

    canRemoveTag(tag) {
        const tagCandidate = tag.querySelector("span.tag").innerText;

        for (const candidate of this.alpineApp.modalCommitteeCandidatesTemp) {
            if (candidate.name === tagCandidate && candidate.votes > 0) {
                this.alpineApp.candidateDeleteError = true;

                return false;
            }
        }

        return true;
    }

    addTag(value) {
        const tag = document.createElement("div");

        tag.className = "control";
        tag.innerHTML = `<div class="tags has-addons"><span class="tag is-link">${value}</span><a class="tag is-delete"></a></div>`;
        tag.querySelector(".is-delete").addEventListener("click", () => {
            if (this.canRemoveTag(tag)) {
                this.removeTag(tag);
            }
        });
        const inputs = this.el.children[this.el.children.length - 1];

        this.el.insertBefore(tag, inputs);
        this.input.dispatchEvent(new Event("change"));
    }

    onKeyDown(event) {
        this.alpineApp.candidateDeleteError = false;

        if (["Enter", ","].includes(event.key)) {
            event.preventDefault();
            const value = this.editable.textContent.trim();
            const tagsValues = this.input.value.split(",").filter(v => v.length > 0);

            if (!validateTag(value, tagsValues)) {
                return;
            }

            tagsValues.push(value);
            this.input.value = tagsValues.join(",");
            this.addTag(value);
            this.editable.innerHTML = "";
        } else if (event.key === "Backspace" &&
            this.editable.textContent.length === 0 &&
            this.el.children.length > 1) {
            const index = this.el.children.length - 2;
            const tag = this.el.children[index];

            if (this.canRemoveTag(tag)) {
                this.removeTag(tag);
            }
        }
    }
}

export default Tagsfield;
