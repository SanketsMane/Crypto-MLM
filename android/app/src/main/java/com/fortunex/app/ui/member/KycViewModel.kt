package com.fortunex.app.ui.member

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.KycState
import com.fortunex.app.data.remote.KycSubmitRequest
import com.fortunex.app.data.remote.KycUpload
import com.fortunex.app.ui.common.UiMessage
import com.fortunex.app.ui.common.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** A document chosen but not yet sent. */
data class PickedDoc(
    val type: String,
    val mimeType: String,
    val sizeBytes: Long,
    val base64: String,
)

data class KycUiState(
    val loading: Boolean = true,
    val server: KycState = KycState(),
    val fullName: String = "",
    val documentNo: String = "",
    val countryCode: String = "",
    val docs: List<PickedDoc> = emptyList(),
    val submitting: Boolean = false,
    val error: UiMessage? = null,
) {
    /** Already settled or under review — nothing for the member to do. */
    val readOnly: Boolean get() = server.status == "APPROVED" || server.status == "PENDING"

    val canSubmit: Boolean
        get() = fullName.trim().length >= 2 &&
            documentNo.trim().length >= 3 &&
            countryCode.trim().length == 2 &&
            docs.isNotEmpty() &&
            !submitting
}

/** The server accepts these four and rejects anything else. */
val KYC_DOC_TYPES = listOf("ID_FRONT", "ID_BACK", "PROOF_OF_ADDRESS", "SELFIE")

private const val MAX_BYTES = 8L * 1024 * 1024

@HiltViewModel
class KycViewModel @Inject constructor(
    private val member: MemberRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(KycUiState())
    val state: StateFlow<KycUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _submitted = Channel<Unit>(Channel.BUFFERED)
    val submitted = _submitted.receiveAsFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            when (val res = member.kyc()) {
                is ApiResult.Ok -> _state.value = _state.value.copy(
                    loading = false,
                    server = res.value,
                    fullName = res.value.submission?.fullName ?: _state.value.fullName,
                    documentNo = res.value.submission?.documentNo ?: _state.value.documentNo,
                    countryCode = res.value.submission?.countryCode ?: _state.value.countryCode,
                )
                is ApiResult.Err -> _state.value = _state.value.copy(
                    loading = false, error = res.error.toMessage(),
                )
            }
        }
    }

    fun onFullName(v: String) { _state.value = _state.value.copy(fullName = v.take(120)) }
    fun onDocumentNo(v: String) { _state.value = _state.value.copy(documentNo = v.take(60)) }
    fun onCountry(v: String) { _state.value = _state.value.copy(countryCode = v.uppercase().take(2)) }

    fun removeDoc(type: String) {
        _state.value = _state.value.copy(docs = _state.value.docs.filterNot { it.type == type })
    }

    /**
     * Reads a picked file and holds it base64-encoded, ready to send.
     *
     * Size is checked HERE rather than after upload. The server caps documents
     * at 8MB, and a modern phone photo can exceed that — discovering it after
     * pushing several megabytes over mobile data, and being told only that the
     * submission failed, is the worst version of this.
     */
    fun addDoc(type: String, uri: Uri) {
        viewModelScope.launch {
            val picked = withContext(Dispatchers.IO) {
                runCatching {
                    val resolver = context.contentResolver
                    val mime = resolver.getType(uri) ?: "image/jpeg"
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: return@runCatching null
                    if (bytes.size > MAX_BYTES) return@runCatching null
                    PickedDoc(
                        type = type,
                        mimeType = mime,
                        sizeBytes = bytes.size.toLong(),
                        // NO_WRAP: line breaks inside a JSON string value would
                        // be rejected before the bytes were ever looked at.
                        base64 = Base64.encodeToString(bytes, Base64.NO_WRAP),
                    )
                }.getOrNull()
            }

            if (picked == null) {
                _messages.send(UiMessage(literal = "That file could not be read, or is larger than 8MB."))
                return@launch
            }
            // One document per type: picking a new front replaces the old one
            // rather than sending both and letting the reviewer guess.
            _state.value = _state.value.copy(
                docs = _state.value.docs.filterNot { it.type == type } + picked,
            )
        }
    }

    fun submit() {
        val s = _state.value
        if (!s.canSubmit) return
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            val body = KycSubmitRequest(
                fullName = s.fullName.trim(),
                documentNo = s.documentNo.trim(),
                countryCode = s.countryCode.trim().uppercase(),
                documents = s.docs.map { KycUpload(it.type, it.mimeType, it.base64) },
            )
            when (val res = member.submitKyc(body)) {
                is ApiResult.Ok -> {
                    // Dropped as soon as they are sent — several megabytes of
                    // identity documents have no business living in memory
                    // after the submission has been accepted.
                    _state.value = _state.value.copy(submitting = false, docs = emptyList())
                    _submitted.send(Unit)
                    load()
                }
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
